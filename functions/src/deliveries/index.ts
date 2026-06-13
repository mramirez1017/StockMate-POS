import { onCall } from "firebase-functions/v2/https";
import {
  DeliveryReceipt,
  DeliveryReceiptItem,
  POStatus,
  Product,
  PurchaseOrder,
  ReceiveDeliveryItemInput,
} from "@stockmate/types";
import { resolveAuth, requirePosAccess, assertBranchAccess } from "../utils/auth";
import { collection, db, now, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument, notFound, failedPrecondition } from "../utils/errors";
import {
  adjustStockBatch,
  getOrCreateInventory,
  refreshDashboardStats,
  updateCriticalStockForProduct,
} from "../utils/stock";

export const receiveDelivery = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requirePosAccess(user);

  const { purchaseOrderId, items, supplierDeliveryNumber } = request.data as {
    purchaseOrderId: string;
    items: ReceiveDeliveryItemInput[];
    supplierDeliveryNumber?: string;
  };

  if (!purchaseOrderId || !items?.length) {
    throw invalidArgument("purchaseOrderId and items are required");
  }

  const poRef = collection(storeId, "purchaseOrders").doc(purchaseOrderId);
  const poSnap = await poRef.get();
  if (!poSnap.exists) throw notFound("Purchase order not found");

  const po = { id: poSnap.id, ...poSnap.data() } as PurchaseOrder;
  if (po.status === "RECEIVED" || po.status === "CANCELLED") {
    throw failedPrecondition(`Purchase order is ${po.status}`);
  }

  assertBranchAccess(user, po.branchId);

  const receiptItems: DeliveryReceiptItem[] = [];
  const updatedPoItems = [...po.items];

  for (const input of items) {
    const poItem = po.items.find((i) => i.productId === input.productId);
    if (!poItem) throw invalidArgument(`Product ${input.productId} not in PO`);

    const damagedQty = input.damagedQty ?? 0;
    const acceptedQty = input.receivedQty - damagedQty;
    const missingQty = Math.max(0, poItem.expectedQty - input.receivedQty);

    receiptItems.push({
      productId: input.productId,
      productName: poItem.productName,
      expectedQty: poItem.expectedQty,
      receivedQty: input.receivedQty,
      damagedQty,
      acceptedQty,
      missingQty,
      expiryDate: input.expiryDate,
      remarks: input.remarks,
      photoProofUrl: input.photoProofUrl,
    });

    const idx = updatedPoItems.findIndex((i) => i.productId === input.productId);
    updatedPoItems[idx] = {
      ...updatedPoItems[idx],
      receivedQty: (updatedPoItems[idx].receivedQty ?? 0) + input.receivedQty,
    };
  }

  const receiptRef = collection(storeId, "deliveryReceipts").doc();
  const receipt: Omit<DeliveryReceipt, "id"> = {
    storeId,
    branchId: po.branchId,
    purchaseOrderId,
    supplierId: po.supplierId,
    receivedBy: uid,
    receivedAt: now(),
    items: receiptItems,
    supplierDeliveryNumber,
  };

  for (const item of receiptItems) {
    if (item.acceptedQty <= 0) continue;
    const productSnap = await collection(storeId, "products").doc(item.productId).get();
    if (!productSnap.exists) throw notFound(`Product ${item.productId} not found`);
    await getOrCreateInventory(
      storeId,
      po.branchId,
      { id: productSnap.id, ...productSnap.data() } as Product,
      0,
    );
  }

  await db.runTransaction(async (tx) => {
    const stockChanges = receiptItems
      .filter((item) => item.acceptedQty > 0)
      .map((item) => ({
        storeId,
        branchId: po.branchId,
        productId: item.productId,
        productName: item.productName,
        quantityChange: item.acceptedQty,
        type: "DELIVERY_RECEIVED" as const,
        referenceId: receiptRef.id,
        remarks: item.remarks,
        userId: uid,
      }));

    await adjustStockBatch(tx, stockChanges);

    tx.set(receiptRef, stripUndefinedDeep(receipt));

    const allReceived = updatedPoItems.every(
      (i) => (i.receivedQty ?? 0) >= i.expectedQty
    );
    const anyReceived = updatedPoItems.some((i) => (i.receivedQty ?? 0) > 0);
    let newStatus: POStatus = po.status;
    if (allReceived) newStatus = "RECEIVED";
    else if (anyReceived) newStatus = "PARTIALLY_RECEIVED";

    tx.update(poRef, { items: updatedPoItems, status: newStatus, updatedAt: now() });
  });

  for (const item of receiptItems) {
    await updateCriticalStockForProduct(storeId, po.branchId, item.productId);
  }
  try {
    await refreshDashboardStats(storeId);
  } catch (err) {
    console.error("refreshDashboardStats failed after receiveDelivery", err);
  }

  return { deliveryReceiptId: receiptRef.id, items: receiptItems };
});
