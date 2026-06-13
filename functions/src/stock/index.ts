import { onCall } from "firebase-functions/v2/https";
import { StockAdjustment } from "@stockmate/types";
import { resolveAuth, requireManagerOrAbove, canApproveAdjustment, assertBranchAccess } from "../utils/auth";
import { collection, db, now } from "../utils/firestore";
import { invalidArgument, notFound, failedPrecondition } from "../utils/errors";
import {
  adjustStock,
  refreshDashboardStats,
  updateCriticalStockForProduct,
} from "../utils/stock";
import { createAuditLogEntry } from "../audit";

export const createStockAdjustment = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { branchId, productId, quantityChange, reason, remarks } = request.data as {
    branchId: string;
    productId: string;
    quantityChange: number;
    reason: string;
    remarks?: string;
  };

  if (!branchId || !productId || quantityChange == null || !reason) {
    throw invalidArgument("branchId, productId, quantityChange, and reason are required");
  }

  assertBranchAccess(user, branchId);

  const productSnap = await collection(storeId, "products").doc(productId).get();
  if (!productSnap.exists) throw notFound("Product not found");

  const ref = collection(storeId, "stockAdjustments").doc();
  const adjustment: Omit<StockAdjustment, "id"> = {
    storeId,
    branchId,
    productId,
    productName: productSnap.data()!.name,
    quantityChange,
    reason,
    remarks,
    status: "PENDING",
    requestedBy: uid,
    createdAt: now(),
  };

  await ref.set(adjustment);

  if (canApproveAdjustment(user)) {
    return approveAdjustmentInternal(storeId, ref.id, uid, user.fullName);
  }

  return { adjustmentId: ref.id, status: "PENDING" };
});

export const approveStockAdjustment = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  if (!canApproveAdjustment(user)) {
    throw invalidArgument("Not authorized to approve adjustments");
  }

  const { adjustmentId } = request.data as { adjustmentId: string };
  if (!adjustmentId) throw invalidArgument("adjustmentId is required");

  return approveAdjustmentInternal(storeId, adjustmentId, uid, user.fullName);
});

async function approveAdjustmentInternal(
  storeId: string,
  adjustmentId: string,
  approverId: string,
  approverName: string
) {
  const ref = collection(storeId, "stockAdjustments").doc(adjustmentId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Adjustment not found");

  const adjustment = { id: snap.id, ...snap.data() } as StockAdjustment;
  if (adjustment.status !== "PENDING") {
    throw failedPrecondition(`Adjustment is ${adjustment.status}`);
  }

  await db.runTransaction(async (tx) => {
    await adjustStock(tx, {
      storeId,
      branchId: adjustment.branchId,
      productId: adjustment.productId,
      productName: adjustment.productName,
      quantityChange: adjustment.quantityChange,
      type: "ADJUSTMENT",
      referenceId: adjustmentId,
      remarks: adjustment.reason,
      userId: approverId,
    });
    tx.update(ref, { status: "APPROVED", approvedBy: approverId, resolvedAt: now() });
  });

  await createAuditLogEntry({
    storeId,
    action: "STOCK_ADJUSTMENT_APPROVED",
    entityType: "stockAdjustment",
    entityId: adjustmentId,
    newValue: { quantityChange: adjustment.quantityChange, reason: adjustment.reason },
    performedBy: approverId,
    performedByName: approverName,
  });

  await updateCriticalStockForProduct(storeId, adjustment.branchId, adjustment.productId);
  await refreshDashboardStats(storeId);

  return { adjustmentId, status: "APPROVED" };
}

export const updateCriticalStock = onCall(async (request) => {
  const { storeId, user } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { branchId } = request.data as { branchId?: string };
  const invSnap = branchId
    ? await collection(storeId, "branchInventory").where("branchId", "==", branchId).get()
    : await collection(storeId, "branchInventory").get();

  for (const doc of invSnap.docs) {
    const inv = doc.data();
    await updateCriticalStockForProduct(storeId, inv.branchId, inv.productId);
  }

  return { updated: invSnap.size };
});

export const updateDashboardStats = onCall(async (request) => {
  const { storeId, user } = await resolveAuth(request);
  requireManagerOrAbove(user);

  await refreshDashboardStats(storeId);
  return { success: true };
});
