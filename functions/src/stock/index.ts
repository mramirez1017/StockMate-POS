import { onCall } from "firebase-functions/v2/https";
import { StockAdjustment } from "@stockmate/types";
import {
  resolveAuth,
  requireManagerOrAbove,
  requirePosAccess,
  canApproveAdjustment,
  assertBranchAccess,
} from "../utils/auth";
import { collection, db, now, stripUndefined } from "../utils/firestore";
import { invalidArgument, notFound, failedPrecondition } from "../utils/errors";
import {
  adjustStock,
  refreshDashboardStats,
  updateCriticalStockForProduct,
} from "../utils/stock";
import { createAuditLogEntry } from "../audit";
import { createNotifications } from "../utils/notify";

export const createStockAdjustment = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  // Cashiers and managers can request; the count only changes on approval.
  requirePosAccess(user);

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
    requestedByName: user.fullName,
    createdAt: now(),
    updatedAt: now(),
  };

  await ref.set(stripUndefined(adjustment));

  if (canApproveAdjustment(user)) {
    return approveAdjustmentInternal(storeId, ref.id, uid, user.fullName);
  }

  try {
    await createNotifications({
      storeId,
      kind: "STOCK_ADJUSTMENT_REQUEST",
      title: `Stock adjustment · ${adjustment.productName}`,
      body: `${user.fullName} requested ${quantityChange > 0 ? "+" : ""}${quantityChange} (${reason}).`,
      link: "/stock-adjustments",
      refType: "STOCK_ADJUSTMENT",
      refId: ref.id,
      branchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after createStockAdjustment", err);
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

export const rejectStockAdjustment = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  if (!canApproveAdjustment(user)) {
    throw invalidArgument("Not authorized to review adjustments");
  }

  const { adjustmentId, note } = request.data as { adjustmentId: string; note?: string };
  if (!adjustmentId) throw invalidArgument("adjustmentId is required");

  const ref = collection(storeId, "stockAdjustments").doc(adjustmentId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Adjustment not found");

  const adjustment = { id: snap.id, ...snap.data() } as StockAdjustment;
  if (adjustment.status !== "PENDING") {
    throw failedPrecondition(`Adjustment is ${adjustment.status}`);
  }

  await ref.update(
    stripUndefined({
      status: "REJECTED",
      approvedBy: uid,
      reviewedByName: user.fullName,
      reviewNote: note,
      resolvedAt: now(),
      updatedAt: now(),
    }),
  );

  await createAuditLogEntry({
    storeId,
    action: "STOCK_ADJUSTMENT_REJECTED",
    entityType: "stockAdjustment",
    entityId: adjustmentId,
    newValue: { quantityChange: adjustment.quantityChange, reason: adjustment.reason, note },
    performedBy: uid,
    performedByName: user.fullName,
  });

  if (adjustment.requestedBy && adjustment.requestedBy !== uid) {
    try {
      await createNotifications({
        storeId,
        kind: "STOCK_ADJUSTMENT_RESOLVED",
        title: `Adjustment rejected · ${adjustment.productName}`,
        body: `${user.fullName} rejected your ${adjustment.quantityChange > 0 ? "+" : ""}${adjustment.quantityChange} adjustment${note ? ` — ${note}` : ""}.`,
        link: "/stock-adjustments",
        refType: "STOCK_ADJUSTMENT",
        refId: adjustmentId,
        branchId: adjustment.branchId,
        actorId: uid,
        actorName: user.fullName,
        recipientUids: [adjustment.requestedBy],
      });
    } catch (err) {
      console.error("createNotifications failed after rejectStockAdjustment", err);
    }
  }

  return { adjustmentId, status: "REJECTED" };
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
    tx.update(ref, {
      status: "APPROVED",
      approvedBy: approverId,
      reviewedByName: approverName,
      resolvedAt: now(),
      updatedAt: now(),
    });
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

  if (adjustment.requestedBy && adjustment.requestedBy !== approverId) {
    try {
      await createNotifications({
        storeId,
        kind: "STOCK_ADJUSTMENT_RESOLVED",
        title: `Adjustment approved · ${adjustment.productName}`,
        body: `${approverName} approved your ${adjustment.quantityChange > 0 ? "+" : ""}${adjustment.quantityChange} adjustment.`,
        link: "/stock-adjustments",
        refType: "STOCK_ADJUSTMENT",
        refId: adjustmentId,
        branchId: adjustment.branchId,
        actorId: approverId,
        actorName: approverName,
        recipientUids: [adjustment.requestedBy],
      });
    } catch (err) {
      console.error("createNotifications failed after approveStockAdjustment", err);
    }
  }

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
