import * as admin from "firebase-admin";
import { onCall, CallableRequest } from "firebase-functions/v2/https";
import {
  POStatus,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseRequest,
  PurchaseRequestType,
} from "@stockmate/types";
import {
  resolveAuth,
  requireAdmin,
  requireCreatePurchaseRequest,
  isStoreAdminRole,
} from "../utils/auth";
import { collection, generatePoNumber, now, stripUndefined, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument, notFound, failedPrecondition } from "../utils/errors";
import { createNotifications } from "../utils/notify";
import { logProcurementEvent } from "../utils/procurement";

const VALID_TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT: ["ORDERED", "CANCELLED"],
  ORDERED: ["IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  IN_TRANSIT: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED", "COMPLETED", "CANCELLED"],
  RECEIVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Mark the originating requests as ORDERED and link them to the new PO. */
async function linkRequestsToPurchaseOrder(
  storeId: string,
  requestIds: string[],
  poId: string,
  poNumber: string,
): Promise<void> {
  const unique = Array.from(new Set(requestIds.filter(Boolean)));
  await Promise.all(
    unique.map(async (requestId) => {
      const ref = collection(storeId, "purchaseRequests").doc(requestId);
      const snap = await ref.get();
      if (!snap.exists) return;
      await ref.update(
        stripUndefined({ status: "ORDERED", purchaseOrderId: poId, updatedAt: now() }),
      );
    }),
  );
  void poNumber;
}

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
  // Only admins create purchase orders. Branch staff raise purchase requests instead.
  requireAdmin(user);

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
    purchaseRequestIds?: string[];
  };

  const requestIds = Array.isArray(data.purchaseRequestIds) ? data.purchaseRequestIds.filter(Boolean) : [];

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
        purchaseRequestIds: requestIds.length
          ? Array.from(new Set([...(existing.purchaseRequestIds ?? []), ...requestIds]))
          : existing.purchaseRequestIds,
        updatedAt: ts,
      }),
    );

    if (requestIds.length) {
      await linkRequestsToPurchaseOrder(storeId, requestIds, existing.id, existing.poNumber);
    }

    try {
      await logProcurementEvent({
        storeId,
        branchId: existing.branchId,
        type: "PO_CREATED",
        message: `${data.items.length} item(s) added to ${existing.poNumber} by ${user.fullName}.`,
        poId: existing.id,
        poNumber: existing.poNumber,
        actor: user,
      });
    } catch (err) {
      console.error("logProcurementEvent failed after PO merge", err);
    }

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
    purchaseRequestIds: requestIds.length ? requestIds : undefined,
    createdBy: uid,
    createdByName: user.fullName,
    createdAt: now(),
    updatedAt: now(),
  };

  await ref.set(stripUndefinedDeep(po));

  if (requestIds.length) {
    try {
      await linkRequestsToPurchaseOrder(storeId, requestIds, ref.id, po.poNumber);
    } catch (err) {
      console.error("linkRequestsToPurchaseOrder failed", err);
    }
  }

  try {
    await logProcurementEvent({
      storeId,
      branchId: po.branchId,
      type: "PO_CREATED",
      message: `${user.fullName} created ${po.poNumber} with ${po.items.length} item(s)${
        requestIds.length ? " from branch request(s)" : ""
      }.`,
      poId: ref.id,
      poNumber: po.poNumber,
      actor: user,
    });
  } catch (err) {
    console.error("logProcurementEvent failed after createPurchaseOrder", err);
  }

  // Let the receiving branch know a delivery is incoming (skip for drafts).
  if (po.status !== "DRAFT") {
    try {
      await createNotifications({
        storeId,
        kind: "PO_CREATED",
        title: `Incoming delivery · ${po.poNumber}`,
        body: `${po.items.length} item${po.items.length === 1 ? "" : "s"} expected on ${po.expectedDeliveryDate}.`,
        link: `/deliveries/${ref.id}`,
        refType: "PURCHASE_ORDER",
        refId: ref.id,
        branchId: data.branchId,
        actorId: uid,
        actorName: user.fullName,
        toBranch: data.branchId,
        excludeUid: uid,
      });
    } catch (err) {
      console.error("createNotifications failed after createPurchaseOrder", err);
    }
  }

  return {
    duplicate: false as const,
    merged: false as const,
    purchaseOrderId: ref.id,
    poNumber: po.poNumber,
    itemCount: po.items.length,
  };
});

export const updatePurchaseOrderStatus = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  // Ordering, transit, completion and cancellation are admin-only. Branch staff
  // only receive deliveries (handled by receiveDelivery), they don't drive PO status.
  requireAdmin(user);

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
    throw failedPrecondition(`Cannot transition from ${po.status} to ${status}`);
  }

  const update: Record<string, unknown> = { status, updatedAt: now() };
  if (status === "COMPLETED") {
    update.completedBy = uid;
    update.completedByName = user.fullName;
    update.completedAt = now();
  }
  await ref.update(stripUndefined(update));

  const eventType =
    status === "COMPLETED"
      ? "PO_COMPLETED"
      : status === "IN_TRANSIT"
        ? "PO_IN_TRANSIT"
        : status === "ORDERED"
          ? "PO_ORDERED"
          : status === "CANCELLED"
            ? "PO_CANCELLED"
            : "PO_ORDERED";

  try {
    await logProcurementEvent({
      storeId,
      branchId: po.branchId,
      type: eventType,
      message:
        status === "COMPLETED"
          ? `${user.fullName} completed and closed ${po.poNumber}.`
          : `${user.fullName} marked ${po.poNumber} as ${status.replace(/_/g, " ").toLowerCase()}.`,
      poId: purchaseOrderId,
      poNumber: po.poNumber,
      actor: user,
    });
  } catch (err) {
    console.error("logProcurementEvent failed after updatePurchaseOrderStatus", err);
  }

  // Keep the branch informed about incoming and closed transactions.
  if (status === "IN_TRANSIT" || status === "COMPLETED") {
    try {
      await createNotifications({
        storeId,
        kind: status === "COMPLETED" ? "PO_COMPLETED" : "PO_CREATED",
        title:
          status === "COMPLETED"
            ? `Transaction closed · ${po.poNumber}`
            : `Delivery on the way · ${po.poNumber}`,
        body:
          status === "COMPLETED"
            ? `${user.fullName} completed ${po.poNumber}. The transaction is now closed.`
            : `${po.poNumber} is in transit to your branch.`,
        link: `/deliveries/${purchaseOrderId}`,
        refType: "PURCHASE_ORDER",
        refId: purchaseOrderId,
        branchId: po.branchId,
        actorId: uid,
        actorName: user.fullName,
        toBranch: po.branchId,
        toAdmins: status === "COMPLETED",
        excludeUid: uid,
      });
    } catch (err) {
      console.error("createNotifications failed after updatePurchaseOrderStatus", err);
    }
  }

  return { success: true };
});

export const createPurchaseRequest = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireCreatePurchaseRequest(user);

  const data = request.data as {
    requestType?: PurchaseRequestType;
    origin?: "BRANCH" | "ADMIN";
    productId?: string;
    suggestedQty?: number;
    subject?: string;
    description?: string;
    notes?: string;
  };

  const requestType: PurchaseRequestType = data.requestType ?? "PRODUCT_REORDER";
  const description = (data.description ?? data.notes)?.trim() || undefined;
  const isAdmin = isStoreAdminRole(user.role);
  // Admins don't approve their own requests — they're auto-approved and the
  // admin is sent straight to the relevant page to fulfil them.
  const adminInitiated = isAdmin && data.origin === "ADMIN";
  const origin: "BRANCH" | "ADMIN" = adminInitiated ? "ADMIN" : "BRANCH";
  const branchId = user.branchId ?? "";
  if (!branchId && !adminInitiated) {
    throw failedPrecondition("Only branch staff can create branch requests");
  }
  const ts = now();

  const base = adminInitiated
    ? {
        storeId,
        branchId,
        requestType,
        origin,
        description,
        notes: data.notes?.trim() || undefined,
        status: "APPROVED" as const,
        requestedBy: uid,
        requestedByName: user.fullName,
        reviewedBy: uid,
        reviewedByName: user.fullName,
        reviewedAt: ts,
        createdAt: ts,
        updatedAt: ts,
      }
    : {
        storeId,
        branchId,
        requestType,
        origin,
        description,
        notes: data.notes?.trim() || undefined,
        status: "PENDING" as const,
        requestedBy: uid,
        requestedByName: user.fullName,
        createdAt: ts,
        updatedAt: ts,
      };

  let docData: Record<string, unknown>;
  let label: string;

  if (requestType === "PRODUCT_REORDER") {
    const { productId, suggestedQty } = data;
    if (!productId || !suggestedQty || suggestedQty < 1) {
      throw invalidArgument("productId and a positive suggestedQty are required");
    }
    const productSnap = await collection(storeId, "products").doc(productId).get();
    if (!productSnap.exists) throw notFound("Product not found");
    const product = productSnap.data()!;

    const invId = `${branchId}_${productId}`;
    const invSnap = await collection(storeId, "branchInventory").doc(invId).get();
    const currentStock = invSnap.exists ? invSnap.data()!.currentStock : 0;
    const criticalLevel = invSnap.exists ? invSnap.data()!.criticalLevel : product.criticalLevel ?? 5;

    docData = {
      ...base,
      productId,
      productName: product.name,
      suggestedQty,
      currentStock,
      criticalLevel,
    };
    label = `${suggestedQty} × ${product.name}`;
  } else {
    const subject = data.subject?.trim();
    if (!subject) throw invalidArgument("A name is required for this request");
    const qty = data.suggestedQty && data.suggestedQty > 0 ? data.suggestedQty : undefined;
    docData = { ...base, subject, productName: subject, suggestedQty: qty };
    label =
      requestType === "NEW_PRODUCT"
        ? `new product “${subject}”`
        : requestType === "NEW_CATEGORY"
          ? `new category “${subject}”`
          : `new supplier “${subject}”`;
  }

  const ref = collection(storeId, "purchaseRequests").doc();
  await ref.set(stripUndefined(docData));

  try {
    await logProcurementEvent({
      storeId,
      branchId,
      type: "REQUEST_CREATED",
      message: adminInitiated
        ? `${user.fullName} created ${label} (admin initiated).`
        : `${user.fullName} requested ${label}${description ? ` — ${description}` : ""}.`,
      requestId: ref.id,
      actor: user,
    });
    if (adminInitiated) {
      await logProcurementEvent({
        storeId,
        branchId,
        type: "REQUEST_APPROVED",
        message: `${user.fullName} auto-approved ${label} (admin initiated).`,
        requestId: ref.id,
        actor: user,
      });
    }
  } catch (err) {
    console.error("logProcurementEvent failed after createPurchaseRequest", err);
  }

  // Branch requests need an admin's attention; admin-initiated ones don't.
  if (!adminInitiated) {
    try {
      await createNotifications({
        storeId,
        kind: "PURCHASE_REQUEST",
        title: `Request · ${label}`,
        body: `${user.fullName} requested ${label}${description ? ` — ${description}` : ""}.`,
        link: `/requests/${ref.id}`,
        refType: "PURCHASE_REQUEST",
        refId: ref.id,
        branchId,
        actorId: uid,
        actorName: user.fullName,
        toAdmins: true,
        excludeUid: uid,
      });
    } catch (err) {
      console.error("createNotifications failed after createPurchaseRequest", err);
    }
  }

  return { purchaseRequestId: ref.id, status: base.status, origin };
});

/**
 * Lets the original requester (or an admin) edit a request while it is still
 * open. Editing a rejected request re-opens it (back to PENDING) and re-notifies
 * the admins, so a branch manager can adjust and resubmit.
 */
export const updatePurchaseRequest = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);

  const { purchaseRequestId, suggestedQty, subject, description, notes } = request.data as {
    purchaseRequestId: string;
    suggestedQty?: number;
    subject?: string;
    description?: string;
    notes?: string;
  };
  if (!purchaseRequestId) throw invalidArgument("purchaseRequestId is required");

  const ref = collection(storeId, "purchaseRequests").doc(purchaseRequestId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Purchase request not found");

  const pr = { id: snap.id, ...snap.data() } as PurchaseRequest;
  const isOwner = pr.requestedBy === uid;
  const isAdmin = isStoreAdminRole(user.role);
  if (!isOwner && !isAdmin) {
    throw failedPrecondition("Only the requester or an admin can edit this request");
  }
  if (pr.status !== "PENDING" && pr.status !== "REJECTED") {
    throw failedPrecondition(`A ${pr.status.toLowerCase()} request can no longer be edited`);
  }

  const requestType = pr.requestType ?? "PRODUCT_REORDER";
  const del = admin.firestore.FieldValue.delete();
  const update: Record<string, unknown> = { updatedAt: now() };
  let newSubject: string | undefined;

  if (requestType === "PRODUCT_REORDER") {
    if (suggestedQty != null) {
      if (suggestedQty < 1) throw invalidArgument("suggestedQty must be at least 1");
      update.suggestedQty = suggestedQty;
    }
  } else {
    if (subject != null) {
      const trimmed = subject.trim();
      if (!trimmed) throw invalidArgument("A name is required");
      newSubject = trimmed;
      update.subject = trimmed;
      update.productName = trimmed;
    }
    if (suggestedQty != null) {
      update.suggestedQty = suggestedQty > 0 ? suggestedQty : del;
    }
  }
  if (description !== undefined) update.description = description.trim() || del;
  if (notes !== undefined) update.notes = notes.trim() || del;

  // Resubmitting a rejected request re-opens it for review.
  const reopened = pr.status === "REJECTED";
  if (reopened) {
    update.status = "PENDING";
    update.reviewedBy = del;
    update.reviewedByName = del;
    update.reviewedAt = del;
    update.reviewNote = del;
  }

  await ref.update(update);

  const itemLabel = newSubject || pr.productName || pr.subject || "the request";

  try {
    await logProcurementEvent({
      storeId,
      branchId: pr.branchId,
      type: reopened ? "REQUEST_CREATED" : "REQUEST_UPDATED",
      message: reopened
        ? `${user.fullName} updated and resubmitted the request for ${itemLabel}.`
        : `${user.fullName} edited the request for ${itemLabel}.`,
      requestId: pr.id,
      actor: user,
    });
  } catch (err) {
    console.error("logProcurementEvent failed after updatePurchaseRequest", err);
  }

  // Re-notify admins when a rejected request is resubmitted.
  if (reopened) {
    try {
      await createNotifications({
        storeId,
        kind: "PURCHASE_REQUEST",
        title: `Request resubmitted · ${itemLabel}`,
        body: `${user.fullName} updated and resubmitted a request for ${itemLabel}.`,
        link: `/requests/${pr.id}`,
        refType: "PURCHASE_REQUEST",
        refId: pr.id,
        branchId: pr.branchId,
        actorId: uid,
        actorName: user.fullName,
        toAdmins: true,
        excludeUid: uid,
      });
    } catch (err) {
      console.error("createNotifications failed after updatePurchaseRequest", err);
    }
  }

  return { success: true, reopened };
});

async function resolvePurchaseRequest(
  request: CallableRequest,
  decision: "APPROVED" | "REJECTED",
) {
  const { storeId, user, uid } = await resolveAuth(request);
  requireAdmin(user);

  const { purchaseRequestId, note } = request.data as {
    purchaseRequestId: string;
    note?: string;
  };
  if (!purchaseRequestId) throw invalidArgument("purchaseRequestId is required");

  const ref = collection(storeId, "purchaseRequests").doc(purchaseRequestId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Purchase request not found");

  const pr = { id: snap.id, ...snap.data() } as PurchaseRequest;
  if (pr.status !== "PENDING") {
    throw failedPrecondition(`Request is already ${pr.status.toLowerCase()}`);
  }

  const itemLabel = pr.productName || pr.subject || "the request";

  await ref.update(
    stripUndefined({
      status: decision,
      reviewedBy: uid,
      reviewedByName: user.fullName,
      reviewedAt: now(),
      reviewNote: note,
      updatedAt: now(),
    }),
  );

  try {
    await logProcurementEvent({
      storeId,
      branchId: pr.branchId,
      type: decision === "APPROVED" ? "REQUEST_APPROVED" : "REQUEST_REJECTED",
      message:
        decision === "APPROVED"
          ? `${user.fullName} approved the request for ${itemLabel}.`
          : `${user.fullName} rejected the request for ${itemLabel}${note ? ` — ${note}` : ""}.`,
      requestId: pr.id,
      actor: user,
    });
  } catch (err) {
    console.error("logProcurementEvent failed after resolvePurchaseRequest", err);
  }

  try {
    await createNotifications({
      storeId,
      kind: "PURCHASE_REQUEST_RESOLVED",
      title:
        decision === "APPROVED"
          ? `Request approved · ${itemLabel}`
          : `Request rejected · ${itemLabel}`,
        body:
          decision === "APPROVED"
            ? `${user.fullName} approved your request for ${itemLabel}.`
            : `${user.fullName} rejected your request for ${itemLabel}${note ? ` — ${note}` : ""}.`,
      link: `/requests/${pr.id}`,
      refType: "PURCHASE_REQUEST",
      refId: pr.id,
      branchId: pr.branchId,
      actorId: uid,
      actorName: user.fullName,
      recipientUids: pr.requestedBy ? [pr.requestedBy] : [],
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after resolvePurchaseRequest", err);
  }

  return { success: true, status: decision };
}

export const approvePurchaseRequest = onCall((request) => resolvePurchaseRequest(request, "APPROVED"));
export const rejectPurchaseRequest = onCall((request) => resolvePurchaseRequest(request, "REJECTED"));

/**
 * Closes the loop on a new product/category/supplier request once the admin has
 * actually created the entity. Links the created record to the request, marks it
 * fulfilled, logs the event, and notifies the original requester.
 */
export const fulfillPurchaseRequest = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireAdmin(user);

  const { purchaseRequestId, resultId, resultName } = request.data as {
    purchaseRequestId: string;
    resultId?: string;
    resultName?: string;
  };
  if (!purchaseRequestId) throw invalidArgument("purchaseRequestId is required");

  const ref = collection(storeId, "purchaseRequests").doc(purchaseRequestId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Purchase request not found");

  const pr = { id: snap.id, ...snap.data() } as PurchaseRequest;
  if (pr.status === "FULFILLED") {
    return { success: true, alreadyFulfilled: true as const };
  }
  if (pr.status !== "APPROVED") {
    throw failedPrecondition(`Request must be approved before it can be fulfilled (currently ${pr.status.toLowerCase()})`);
  }

  const itemLabel = resultName || pr.productName || pr.subject || "the request";

  await ref.update(
    stripUndefined({
      status: "FULFILLED",
      resultId,
      fulfilledBy: uid,
      fulfilledByName: user.fullName,
      fulfilledAt: now(),
      updatedAt: now(),
    }),
  );

  try {
    await logProcurementEvent({
      storeId,
      branchId: pr.branchId,
      type: "REQUEST_FULFILLED",
      message: `${user.fullName} fulfilled the request by creating ${itemLabel}.`,
      requestId: pr.id,
      actor: user,
    });
  } catch (err) {
    console.error("logProcurementEvent failed after fulfillPurchaseRequest", err);
  }

  // Tell the requester it's done (skip admin-initiated, where requester is the admin).
  if (pr.requestedBy && pr.requestedBy !== uid) {
    try {
      await createNotifications({
        storeId,
        kind: "PURCHASE_REQUEST_RESOLVED",
        title: `Request fulfilled · ${itemLabel}`,
        body: `${user.fullName} created ${itemLabel} for your request.`,
        link: `/requests/${pr.id}`,
        refType: "PURCHASE_REQUEST",
        refId: pr.id,
        branchId: pr.branchId,
        actorId: uid,
        actorName: user.fullName,
        recipientUids: [pr.requestedBy],
        excludeUid: uid,
      });
    } catch (err) {
      console.error("createNotifications failed after fulfillPurchaseRequest", err);
    }
  }

  return { success: true };
});
