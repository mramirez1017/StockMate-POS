import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";
import {
  resolveAuth,
  requirePosAccess,
  assertBranchAccess,
  isManagerOrAbove,
} from "../utils/auth";
import { collection, db, now } from "../utils/firestore";
import { invalidArgument, notFound } from "../utils/errors";
import { Sale } from "@stockmate/types";
import {
  createVoidRequest,
  executeVoidSale,
  loadCompletedSale,
  loadPendingVoidRequest,
} from "./voidHelpers";

function requireReason(reason: unknown): string {
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (!trimmed) throw invalidArgument("A reason is required to void a sale");
  if (trimmed.length < 3) throw invalidArgument("Please enter a more detailed reason (at least 3 characters)");
  return trimmed;
}

/** Cashier requests void; admin/manager voids immediately. */
export const voidSale = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requirePosAccess(user);

  const { saleId, reason } = request.data as { saleId: string; reason?: string };
  if (!saleId) throw invalidArgument("saleId is required");
  const voidReason = requireReason(reason);

  const saleRef = collection(storeId, "sales").doc(saleId);
  const existingSnap = await saleRef.get();
  if (!existingSnap.exists) throw notFound("Sale not found");
  const existing = { id: existingSnap.id, ...existingSnap.data() } as Sale;
  if (existing.status === "VOIDED") {
    return { status: "VOIDED" as const, saleId, alreadyVoided: true };
  }

  const { ref: saleRefResolved, sale } = await loadCompletedSale(storeId, saleId);
  assertBranchAccess(user, sale.branchId);

  if (isManagerOrAbove(user)) {
    await executeVoidSale(storeId, sale, saleRefResolved, voidReason, uid, user.fullName);
    return { status: "VOIDED" as const, saleId };
  }

  const voidRequest = await createVoidRequest(storeId, sale, saleRefResolved, voidReason, user, uid);
  return { status: "PENDING" as const, voidRequestId: voidRequest.id, saleId };
});

export const approveSaleVoid = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  if (!isManagerOrAbove(user)) {
    throw invalidArgument("Only admin or branch manager can approve void requests");
  }

  const { voidRequestId, reviewNote } = request.data as { voidRequestId: string; reviewNote?: string };
  if (!voidRequestId) throw invalidArgument("voidRequestId is required");

  const { ref: reqRef, request: voidRequest } = await loadPendingVoidRequest(storeId, voidRequestId);
  assertBranchAccess(user, voidRequest.branchId);

  const { ref: saleRef, sale } = await loadCompletedSale(storeId, voidRequest.saleId, {
    allowPendingVoid: true,
  });
  if (sale.pendingVoidRequestId !== voidRequestId) {
    throw invalidArgument("Void request no longer matches this sale");
  }

  await executeVoidSale(storeId, sale, saleRef, voidRequest.reason, uid, user.fullName);

  await reqRef.update({
    status: "APPROVED",
    reviewedBy: uid,
    reviewedByName: user.fullName,
    reviewedAt: now(),
    ...(reviewNote?.trim() ? { reviewNote: reviewNote.trim() } : {}),
  });

  return { status: "APPROVED" as const, saleId: sale.id };
});

export const rejectSaleVoid = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  if (!isManagerOrAbove(user)) {
    throw invalidArgument("Only admin or branch manager can reject void requests");
  }

  const { voidRequestId, reviewNote } = request.data as { voidRequestId: string; reviewNote?: string };
  if (!voidRequestId) throw invalidArgument("voidRequestId is required");

  const { ref: reqRef, request: voidRequest } = await loadPendingVoidRequest(storeId, voidRequestId);
  assertBranchAccess(user, voidRequest.branchId);

  const saleRef = collection(storeId, "sales").doc(voidRequest.saleId);

  await db.runTransaction(async (tx) => {
    tx.update(reqRef, {
      status: "REJECTED",
      reviewedBy: uid,
      reviewedByName: user.fullName,
      reviewedAt: now(),
      ...(reviewNote?.trim() ? { reviewNote: reviewNote.trim() } : {}),
    });
    tx.update(saleRef, { pendingVoidRequestId: admin.firestore.FieldValue.delete() });
  });

  return { status: "REJECTED" as const, saleId: voidRequest.saleId };
});
