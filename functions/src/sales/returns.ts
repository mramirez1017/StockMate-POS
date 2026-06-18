import { onCall } from "firebase-functions/v2/https";
import { Product, Sale, SaleReturn, SaleReturnItem } from "@stockmate/types";
import { resolveAuth, requireManagerOrAbove, assertBranchAccess } from "../utils/auth";
import { collection, db, now, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument, notFound, failedPrecondition } from "../utils/errors";
import {
  adjustStockBatch,
  getOrCreateInventory,
  refreshDashboardStats,
  updateCriticalStockForProduct,
} from "../utils/stock";
import { createNotifications } from "../utils/notify";
import { createAuditLogEntry } from "../audit";

type ReturnItemInput = {
  productId: string;
  quantity: number;
  refundAmount?: number;
  restock?: boolean;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Process a (partial or full) return against a completed sale. Manager+ only. */
export const createSaleReturn = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { saleId, items, reason, refundMethod } = request.data as {
    saleId: string;
    items: ReturnItemInput[];
    reason?: string;
    refundMethod?: string;
  };
  if (!saleId) throw invalidArgument("saleId is required");
  if (!items?.length) throw invalidArgument("At least one item is required");

  const saleRef = collection(storeId, "sales").doc(saleId);
  const saleSnap = await saleRef.get();
  if (!saleSnap.exists) throw notFound("Sale not found");
  const sale = { id: saleSnap.id, ...saleSnap.data() } as Sale;

  if (sale.status === "VOIDED") throw failedPrecondition("This sale has been voided");
  if (sale.status === "REFUNDED") throw failedPrecondition("This sale has already been fully refunded");
  if (sale.status !== "COMPLETED" && sale.status !== "PARTIALLY_REFUNDED") {
    throw failedPrecondition("Only completed sales can be returned");
  }
  assertBranchAccess(user, sale.branchId);

  // Sum previously returned quantities per product across existing returns.
  const priorSnap = await collection(storeId, "saleReturns").where("saleId", "==", saleId).get();
  const alreadyReturned = new Map<string, number>();
  priorSnap.docs.forEach((d) => {
    const r = d.data() as SaleReturn;
    r.items?.forEach((it) => {
      alreadyReturned.set(it.productId, (alreadyReturned.get(it.productId) ?? 0) + it.quantity);
    });
  });

  const returnItems: SaleReturnItem[] = [];
  for (const input of items) {
    const qty = Math.floor(Number(input.quantity));
    if (!input.productId || !Number.isFinite(qty) || qty <= 0) continue;

    const saleItem = sale.items.find((i) => i.productId === input.productId);
    if (!saleItem) throw invalidArgument(`Product ${input.productId} is not on this sale`);

    const remaining = saleItem.quantity - (alreadyReturned.get(input.productId) ?? 0);
    if (qty > remaining) {
      throw failedPrecondition(
        `Cannot return ${qty} of ${saleItem.productName}; only ${remaining} remain returnable.`,
      );
    }

    const effectiveUnit = saleItem.quantity > 0 ? saleItem.lineTotal / saleItem.quantity : saleItem.unitPrice;
    const refundAmount =
      input.refundAmount != null && Number.isFinite(input.refundAmount)
        ? round2(Math.max(0, input.refundAmount))
        : round2(effectiveUnit * qty);

    returnItems.push({
      productId: input.productId,
      productName: saleItem.productName,
      quantity: qty,
      unitPrice: saleItem.unitPrice,
      refundAmount,
      restock: input.restock !== false,
    });
  }

  if (returnItems.length === 0) throw invalidArgument("No valid items to return");

  const refundTotal = round2(returnItems.reduce((s, i) => s + i.refundAmount, 0));
  const returnRef = collection(storeId, "saleReturns").doc();

  // Ensure inventory docs exist for restockable items.
  for (const item of returnItems) {
    if (!item.restock) continue;
    const productSnap = await collection(storeId, "products").doc(item.productId).get();
    if (!productSnap.exists) throw notFound(`Product ${item.productId} not found`);
    await getOrCreateInventory(
      storeId,
      sale.branchId,
      { id: productSnap.id, ...productSnap.data() } as Product,
      0,
    );
  }

  // Determine whether the sale is now fully refunded.
  const totalReturnedAfter = new Map<string, number>(alreadyReturned);
  returnItems.forEach((it) => {
    totalReturnedAfter.set(it.productId, (totalReturnedAfter.get(it.productId) ?? 0) + it.quantity);
  });
  const fullyRefunded = sale.items.every(
    (i) => (totalReturnedAfter.get(i.productId) ?? 0) >= i.quantity,
  );
  const newRefundedTotal = round2((sale.refundedTotal ?? 0) + refundTotal);

  const saleReturn: Omit<SaleReturn, "id"> = {
    storeId,
    branchId: sale.branchId,
    saleId,
    items: returnItems,
    refundTotal,
    reason: reason?.trim() || "Customer return",
    refundMethod: refundMethod?.trim() || sale.paymentMethod || "CASH",
    processedBy: uid,
    processedByName: user.fullName,
    createdAt: now(),
  };

  await db.runTransaction(async (tx) => {
    const restockChanges = returnItems
      .filter((item) => item.restock)
      .map((item) => ({
        storeId,
        branchId: sale.branchId,
        productId: item.productId,
        productName: item.productName,
        quantityChange: item.quantity,
        type: "RETURN" as const,
        referenceId: returnRef.id,
        remarks: `Return for sale ${sale.id.slice(-6).toUpperCase()}`,
        userId: uid,
      }));
    await adjustStockBatch(tx, restockChanges);

    tx.set(returnRef, stripUndefinedDeep(saleReturn));
    tx.update(saleRef, {
      status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      refundedTotal: newRefundedTotal,
    });
  });

  for (const item of returnItems) {
    if (!item.restock) continue;
    try {
      await updateCriticalStockForProduct(storeId, sale.branchId, item.productId);
    } catch (err) {
      console.error("updateCriticalStockForProduct failed after return", err);
    }
  }

  try {
    await createAuditLogEntry({
      storeId,
      action: "SALE_RETURNED",
      entityType: "sale",
      entityId: sale.id,
      performedBy: uid,
      performedByName: user.fullName,
      newValue: { refundTotal, items: returnItems.length, fullyRefunded },
    });
  } catch (err) {
    console.error("createAuditLogEntry failed after return", err);
  }

  try {
    await refreshDashboardStats(storeId);
  } catch (err) {
    console.error("refreshDashboardStats failed after return", err);
  }

  try {
    await createNotifications({
      storeId,
      kind: "SALE_RETURN",
      title: `Return processed · sale #${sale.id.slice(-6).toUpperCase()}`,
      body: `${user.fullName} refunded ₱${refundTotal.toFixed(2)} (${returnItems.length} item(s)).`,
      link: "/sales",
      refType: "SALE_RETURN",
      refId: returnRef.id,
      branchId: sale.branchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      toBranch: sale.branchId,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after createSaleReturn", err);
  }

  return {
    returnId: returnRef.id,
    refundTotal,
    status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
  };
});
