import { onCall } from "firebase-functions/v2/https";
import { POStatus, PurchaseOrder, PurchaseOrderItem } from "@stockmate/types";
import { resolveAuth, requireManagerOrAbove } from "../utils/auth";
import { collection, generatePoNumber, now, stripUndefined, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument, notFound } from "../utils/errors";

const VALID_TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT: ["ORDERED", "CANCELLED"],
  ORDERED: ["IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  IN_TRANSIT: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

const MERGEABLE_PO_STATUSES: POStatus[] = ["DRAFT", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"];

function mergePoItems(existing: PurchaseOrderItem[], incoming: PurchaseOrderItem[]): PurchaseOrderItem[] {
  const map = new Map<string, PurchaseOrderItem>();
  for (const item of existing) {
    map.set(item.productId, { ...item });
  }
  for (const item of incoming) {
    const prev = map.get(item.productId);
    if (prev) {
      map.set(item.productId, {
        ...prev,
        productName: item.productName || prev.productName,
        expectedQty: prev.expectedQty + item.expectedQty,
      });
    } else {
      map.set(item.productId, { ...item });
    }
  }
  return Array.from(map.values());
}

async function findMergeablePurchaseOrder(
  storeId: string,
  branchId: string,
  supplierId: string,
  expectedDeliveryDate: string
): Promise<(PurchaseOrder & { id: string }) | null> {
  try {
    const snap = await collection(storeId, "purchaseOrders")
      .where("supplierId", "==", supplierId)
      .where("branchId", "==", branchId)
      .where("expectedDeliveryDate", "==", expectedDeliveryDate)
      .get();

    const match = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as PurchaseOrder & { id: string }))
      .filter((po) => MERGEABLE_PO_STATUSES.includes(po.status))
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))[0];

    return match ?? null;
  } catch (err) {
    console.error("findMergeablePurchaseOrder failed (continuing without merge check):", err);
    return null;
  }
}

export const createPurchaseOrder = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const data = request.data as {
    branchId: string;
    supplierId: string;
    expectedDeliveryDate: string;
    items: PurchaseOrderItem[];
    poNumber?: string;
    supplierReferenceNumber?: string;
    notes?: string;
    expectedCost?: number;
    attachmentUrl?: string;
    status?: POStatus;
    allowDuplicate?: boolean;
    mergeIntoPurchaseOrderId?: string;
  };

  if (!data.branchId || !data.supplierId || !data.expectedDeliveryDate || !data.items?.length) {
    throw invalidArgument("branchId, supplierId, expectedDeliveryDate, and items are required");
  }

  if (data.mergeIntoPurchaseOrderId) {
    const ref = collection(storeId, "purchaseOrders").doc(data.mergeIntoPurchaseOrderId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Purchase order not found");

    const existing = { id: snap.id, ...snap.data() } as PurchaseOrder & { id: string };
    if (!MERGEABLE_PO_STATUSES.includes(existing.status)) {
      throw invalidArgument(`Cannot add items to a ${existing.status} purchase order`);
    }
    if (
      existing.branchId !== data.branchId ||
      existing.supplierId !== data.supplierId ||
      existing.expectedDeliveryDate !== data.expectedDeliveryDate
    ) {
      throw invalidArgument("Purchase order supplier, branch, or delivery date does not match");
    }

    const mergedItems = mergePoItems(existing.items, data.items);
    const ts = now();
    const mergedNotes = data.notes?.trim()
      ? existing.notes
        ? `${existing.notes}\n${data.notes.trim()}`
        : data.notes.trim()
      : existing.notes;
    await ref.update(
      stripUndefined({
        items: mergedItems,
        notes: mergedNotes,
        updatedAt: ts,
      }),
    );

    return {
      duplicate: false as const,
      merged: true as const,
      purchaseOrderId: existing.id,
      poNumber: existing.poNumber,
      itemCount: mergedItems.length,
    };
  }

  if (!data.allowDuplicate) {
    const existing = await findMergeablePurchaseOrder(
      storeId,
      data.branchId,
      data.supplierId,
      data.expectedDeliveryDate
    );
    if (existing) {
      return {
        duplicate: true as const,
        existingPurchaseOrderId: existing.id,
        poNumber: existing.poNumber,
        status: existing.status,
        existingItemCount: existing.items.length,
      };
    }
  }

  const ref = collection(storeId, "purchaseOrders").doc();
  const po: Omit<PurchaseOrder, "id"> = {
    storeId,
    branchId: data.branchId,
    supplierId: data.supplierId,
    poNumber: data.poNumber ?? generatePoNumber(),
    supplierReferenceNumber: data.supplierReferenceNumber,
    expectedDeliveryDate: data.expectedDeliveryDate,
    expectedCost: data.expectedCost,
    notes: data.notes,
    attachmentUrl: data.attachmentUrl,
    status: data.status ?? "DRAFT",
    items: data.items,
    createdBy: uid,
    createdAt: now(),
    updatedAt: now(),
  };

  await ref.set(stripUndefinedDeep(po));
  return {
    duplicate: false as const,
    merged: false as const,
    purchaseOrderId: ref.id,
    poNumber: po.poNumber,
    itemCount: po.items.length,
  };
});

export const updatePurchaseOrderStatus = onCall(async (request) => {
  const { storeId, user } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { purchaseOrderId, status } = request.data as {
    purchaseOrderId: string;
    status: POStatus;
  };

  if (!purchaseOrderId || !status) {
    throw invalidArgument("purchaseOrderId and status are required");
  }

  const ref = collection(storeId, "purchaseOrders").doc(purchaseOrderId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Purchase order not found");

  const po = snap.data() as PurchaseOrder;
  const allowed = VALID_TRANSITIONS[po.status];
  if (!allowed.includes(status)) {
    throw invalidArgument(`Cannot transition from ${po.status} to ${status}`);
  }

  await ref.update({ status, updatedAt: now() });
  return { success: true };
});

export const createPurchaseRequest = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { productId, suggestedQty, notes } = request.data as {
    productId: string;
    suggestedQty: number;
    notes?: string;
  };

  if (!productId || !suggestedQty) {
    throw invalidArgument("productId and suggestedQty are required");
  }

  const productSnap = await collection(storeId, "products").doc(productId).get();
  if (!productSnap.exists) throw notFound("Product not found");
  const product = productSnap.data()!;

  const invId = `${user.branchId}_${productId}`;
  const invSnap = await collection(storeId, "branchInventory").doc(invId).get();
  const currentStock = invSnap.exists ? invSnap.data()!.currentStock : 0;
  const criticalLevel = invSnap.exists ? invSnap.data()!.criticalLevel : product.criticalLevel ?? 5;

  const ref = collection(storeId, "purchaseRequests").doc();
  await ref.set({
    storeId,
    branchId: user.branchId,
    productId,
    productName: product.name,
    suggestedQty,
    currentStock,
    criticalLevel,
    status: "PENDING",
    requestedBy: uid,
    notes,
    createdAt: now(),
  });

  return { purchaseRequestId: ref.id };
});
