import * as admin from "firebase-admin";
import { Product, Sale, SaleVoidRequest, User } from "@stockmate/types";
import { createAuditLogEntry } from "../audit";
import { collection, db, now, stripUndefinedDeep } from "../utils/firestore";
import { failedPrecondition, notFound } from "../utils/errors";
import {
  adjustStockBatch,
  getOrCreateInventory,
  refreshDashboardStats,
  updateCriticalStockForProduct,
} from "../utils/stock";

export async function loadCompletedSale(
  storeId: string,
  saleId: string,
  options?: { allowPendingVoid?: boolean },
): Promise<{ ref: FirebaseFirestore.DocumentReference; sale: Sale }> {
  const saleRef = collection(storeId, "sales").doc(saleId);
  const saleSnap = await saleRef.get();
  if (!saleSnap.exists) throw notFound("Sale not found");

  const sale = { id: saleSnap.id, ...saleSnap.data() } as Sale;
  if (sale.status === "VOIDED") {
    throw failedPrecondition("This sale has already been voided");
  }
  if (sale.status !== "COMPLETED") {
    throw failedPrecondition(`Sale is ${sale.status.toLowerCase()}`);
  }
  if (!options?.allowPendingVoid && sale.pendingVoidRequestId) {
    throw failedPrecondition("A void request is already pending for this sale");
  }

  return { ref: saleRef, sale };
}

export async function executeVoidSale(
  storeId: string,
  sale: Sale,
  saleRef: FirebaseFirestore.DocumentReference,
  reason: string,
  performedBy: string,
  performedByName: string,
): Promise<void> {
  for (const item of sale.items) {
    const productSnap = await collection(storeId, "products").doc(item.productId).get();
    if (!productSnap.exists) throw notFound(`Product ${item.productId} not found`);
    await getOrCreateInventory(
      storeId,
      sale.branchId,
      { id: productSnap.id, ...productSnap.data() } as Product,
      0,
    );
  }

  await db.runTransaction(async (tx) => {
    await adjustStockBatch(
      tx,
      sale.items.map((item) => ({
        storeId,
        branchId: sale.branchId,
        productId: item.productId,
        productName: item.productName,
        quantityChange: item.quantity,
        type: "RETURN" as const,
        referenceId: sale.id,
        remarks: reason,
        userId: performedBy,
      })),
    );

    tx.update(saleRef, {
      status: "VOIDED",
      voidReason: reason,
      voidedBy: performedBy,
      voidedAt: now(),
      pendingVoidRequestId: admin.firestore.FieldValue.delete(),
    });
  });

  for (const item of sale.items) {
    try {
      await updateCriticalStockForProduct(storeId, sale.branchId, item.productId);
    } catch (err) {
      console.error("updateCriticalStockForProduct failed after void", err);
    }
  }

  try {
    await createAuditLogEntry({
      storeId,
      action: "SALE_VOIDED",
      entityType: "sale",
      entityId: sale.id,
      performedBy,
      performedByName,
      newValue: { reason },
    });
  } catch (err) {
    console.error("createAuditLogEntry failed after void", err);
  }

  try {
    await refreshDashboardStats(storeId);
  } catch (err) {
    console.error("refreshDashboardStats failed after void", err);
  }
}

export async function createVoidRequest(
  storeId: string,
  sale: Sale,
  saleRef: FirebaseFirestore.DocumentReference,
  reason: string,
  user: User,
  uid: string,
): Promise<SaleVoidRequest> {
  const reqRef = collection(storeId, "saleVoidRequests").doc();
  const voidRequest = stripUndefinedDeep({
    storeId,
    branchId: sale.branchId,
    saleId: sale.id,
    reason,
    status: "PENDING" as const,
    requestedBy: uid,
    requestedByName: user.fullName,
    requestedAt: now(),
  }) as Omit<SaleVoidRequest, "id">;

  await db.runTransaction(async (tx) => {
    tx.set(reqRef, voidRequest);
    tx.update(saleRef, { pendingVoidRequestId: reqRef.id });
  });

  return { id: reqRef.id, ...voidRequest };
}

export async function loadPendingVoidRequest(
  storeId: string,
  voidRequestId: string,
): Promise<{ ref: FirebaseFirestore.DocumentReference; request: SaleVoidRequest }> {
  const ref = collection(storeId, "saleVoidRequests").doc(voidRequestId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Void request not found");

  const request = { id: snap.id, ...snap.data() } as SaleVoidRequest;
  if (request.status !== "PENDING") {
    throw failedPrecondition(`Void request is ${request.status.toLowerCase()}`);
  }

  return { ref, request };
}
