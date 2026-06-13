import { onCall } from "firebase-functions/v2/https";
import { Disposal, DisposalReason, Product } from "@stockmate/types";
import { resolveAuth, requirePosAccess, assertBranchAccess } from "../utils/auth";
import { collection, db, now } from "../utils/firestore";
import { invalidArgument, notFound } from "../utils/errors";
import {
  adjustStock,
  refreshDashboardStats,
  updateCriticalStockForProduct,
} from "../utils/stock";

const VALID_REASONS: DisposalReason[] = [
  "EXPIRED",
  "DAMAGED",
  "SPOILED",
  "LOST",
  "RETURNED_TO_SUPPLIER",
  "DISPOSED",
  "OTHER",
];

export const createDisposal = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requirePosAccess(user);

  const { branchId, productId, quantity, reason, remarks, photoUrl } = request.data as {
    branchId: string;
    productId: string;
    quantity: number;
    reason: DisposalReason;
    remarks?: string;
    photoUrl?: string;
  };

  if (!branchId || !productId || !quantity || !reason) {
    throw invalidArgument("branchId, productId, quantity, and reason are required");
  }
  if (!VALID_REASONS.includes(reason)) {
    throw invalidArgument("Invalid disposal reason");
  }

  assertBranchAccess(user, branchId);

  const productSnap = await collection(storeId, "products").doc(productId).get();
  if (!productSnap.exists) throw notFound("Product not found");
  const product = { id: productSnap.id, ...productSnap.data() } as Product;

  const disposalRef = collection(storeId, "disposals").doc();
  const disposal: Omit<Disposal, "id"> = {
    storeId,
    branchId,
    productId,
    productName: product.name,
    quantity,
    reason,
    remarks,
    photoUrl,
    createdBy: uid,
    createdAt: now(),
  };

  await db.runTransaction(async (tx) => {
    await adjustStock(tx, {
      storeId,
      branchId,
      productId,
      productName: product.name,
      quantityChange: -quantity,
      type: "DISPOSAL",
      referenceId: disposalRef.id,
      remarks: `${reason}${remarks ? `: ${remarks}` : ""}`,
      userId: uid,
    });
    tx.set(disposalRef, disposal);
  });

  await updateCriticalStockForProduct(storeId, branchId, productId);
  await refreshDashboardStats(storeId);

  return { disposalId: disposalRef.id };
});
