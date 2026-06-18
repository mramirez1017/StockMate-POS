import { onCall } from "firebase-functions/v2/https";
import {
  BranchInventory,
  Product,
  StockCount,
  StockCountItem,
  StockCountScope,
} from "@stockmate/types";
import { resolveAuth, requireManagerOrAbove, assertBranchAccess } from "../utils/auth";
import { collection, db, inventoryDocId, now, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument, notFound, failedPrecondition } from "../utils/errors";
import {
  adjustStockBatch,
  refreshDashboardStats,
  updateCriticalStockForProduct,
} from "../utils/stock";
import { createNotifications } from "../utils/notify";
import { createAuditLogEntry } from "../audit";

function generateCountNumber(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `SC-${n}`;
}

/**
 * Open a stock-take session. Snapshots the current on-hand quantity for every
 * counted product so variances are measured against a fixed baseline. Manager+.
 */
export const createStockCount = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { branchId, scope, productIds, notes } = request.data as {
    branchId: string;
    scope?: StockCountScope;
    productIds?: string[];
    notes?: string;
  };
  if (!branchId) throw invalidArgument("branchId is required");
  assertBranchAccess(user, branchId);

  const countScope: StockCountScope = scope === "PARTIAL" ? "PARTIAL" : "FULL";

  // An open session per branch keeps counts unambiguous.
  const openSnap = await collection(storeId, "stockCounts")
    .where("branchId", "==", branchId)
    .where("status", "==", "IN_PROGRESS")
    .get();
  if (!openSnap.empty) {
    throw failedPrecondition("There is already an open stock count for this branch. Complete or cancel it first.");
  }

  const productsSnap = await collection(storeId, "products").where("status", "==", "ACTIVE").get();
  const products = new Map<string, Product>();
  productsSnap.docs.forEach((d) => products.set(d.id, { id: d.id, ...d.data() } as Product));

  let targetProductIds: string[];
  if (countScope === "PARTIAL") {
    const requested = Array.isArray(productIds) ? productIds.filter((id) => products.has(id)) : [];
    if (requested.length === 0) {
      throw invalidArgument("Select at least one product for a partial count");
    }
    targetProductIds = Array.from(new Set(requested));
  } else {
    targetProductIds = Array.from(products.keys());
  }

  // Snapshot expected quantities from branch inventory.
  const invSnaps = await Promise.all(
    targetProductIds.map((pid) =>
      collection(storeId, "branchInventory").doc(inventoryDocId(branchId, pid)).get(),
    ),
  );
  const expectedByProduct = new Map<string, number>();
  invSnaps.forEach((snap, i) => {
    const pid = targetProductIds[i];
    expectedByProduct.set(pid, snap.exists ? (snap.data() as BranchInventory).currentStock : 0);
  });

  const items: StockCountItem[] = targetProductIds
    .map((pid) => ({
      productId: pid,
      productName: products.get(pid)?.name ?? "Unknown",
      expectedQty: expectedByProduct.get(pid) ?? 0,
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName));

  const ref = collection(storeId, "stockCounts").doc();
  const count: Omit<StockCount, "id"> = {
    storeId,
    branchId,
    countNumber: generateCountNumber(),
    scope: countScope,
    status: "IN_PROGRESS",
    items,
    notes: notes?.trim() || undefined,
    startedBy: uid,
    startedByName: user.fullName,
    startedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };
  await ref.set(stripUndefinedDeep(count));

  try {
    await createNotifications({
      storeId,
      kind: "STOCK_COUNT",
      title: `Stock count started · ${count.countNumber}`,
      body: `${user.fullName} opened a ${countScope.toLowerCase()} count of ${items.length} item(s).`,
      link: "/stock-counts",
      refType: "STOCK_COUNT",
      refId: ref.id,
      branchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      toBranch: branchId,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after createStockCount", err);
  }

  return { countId: ref.id, countNumber: count.countNumber, itemCount: items.length };
});

/**
 * Submit counted quantities. Recomputes variance against the live on-hand at
 * post time (so concurrent sales are respected) and posts ADJUSTMENT movements
 * to reconcile inventory to the physical count. Manager+.
 */
export const submitStockCount = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { countId, counts, notes } = request.data as {
    countId: string;
    counts: { productId: string; countedQty: number }[];
    notes?: string;
  };
  if (!countId) throw invalidArgument("countId is required");
  if (!Array.isArray(counts)) throw invalidArgument("counts must be an array");

  const ref = collection(storeId, "stockCounts").doc(countId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Stock count not found");
  const count = { id: snap.id, ...snap.data() } as StockCount;

  if (count.status !== "IN_PROGRESS") throw failedPrecondition(`Stock count is ${count.status}`);
  assertBranchAccess(user, count.branchId);

  const countedMap = new Map<string, number>();
  for (const c of counts) {
    const q = Math.floor(Number(c.countedQty));
    if (c.productId && Number.isFinite(q) && q >= 0) countedMap.set(c.productId, q);
  }
  if (countedMap.size === 0) throw invalidArgument("Enter at least one counted quantity");

  // Re-read live on-hand so variance reflects the actual posting moment.
  const targetIds = count.items.map((i) => i.productId).filter((pid) => countedMap.has(pid));
  const invRefs = targetIds.map((pid) =>
    collection(storeId, "branchInventory").doc(inventoryDocId(count.branchId, pid)),
  );
  const invSnaps = await Promise.all(invRefs.map((r) => r.get()));
  const liveStock = new Map<string, number>();
  invSnaps.forEach((s, i) => {
    liveStock.set(targetIds[i], s.exists ? (s.data() as BranchInventory).currentStock : 0);
  });

  const resultItems: StockCountItem[] = count.items.map((item) => {
    if (!countedMap.has(item.productId)) return { ...item };
    const countedQty = countedMap.get(item.productId)!;
    const live = liveStock.get(item.productId) ?? item.expectedQty;
    return { ...item, countedQty, variance: countedQty - live };
  });

  const adjustments = resultItems
    .filter((i) => i.countedQty != null && (i.variance ?? 0) !== 0)
    .map((i) => ({
      storeId,
      branchId: count.branchId,
      productId: i.productId,
      productName: i.productName,
      quantityChange: i.variance ?? 0,
      type: "ADJUSTMENT" as const,
      referenceId: count.id,
      remarks: `Stock count ${count.countNumber} variance`,
      userId: uid,
    }));

  const totalVarianceUnits = resultItems.reduce((s, i) => s + Math.abs(i.variance ?? 0), 0);
  const countedItems = resultItems.filter((i) => i.countedQty != null).length;
  const varianceItems = resultItems.filter((i) => (i.variance ?? 0) !== 0).length;

  await db.runTransaction(async (tx) => {
    if (adjustments.length > 0) await adjustStockBatch(tx, adjustments);
    tx.update(ref, {
      status: "COMPLETED",
      items: resultItems,
      notes: notes?.trim() || count.notes || null,
      totalVarianceUnits,
      countedItems,
      varianceItems,
      completedBy: uid,
      completedByName: user.fullName,
      completedAt: now(),
      updatedAt: now(),
    });
  });

  for (const adj of adjustments) {
    try {
      await updateCriticalStockForProduct(storeId, count.branchId, adj.productId);
    } catch (err) {
      console.error("updateCriticalStockForProduct failed after submitStockCount", err);
    }
  }

  try {
    await createAuditLogEntry({
      storeId,
      action: "STOCK_COUNT_COMPLETED",
      entityType: "stockCount",
      entityId: count.id,
      performedBy: uid,
      performedByName: user.fullName,
      newValue: { countNumber: count.countNumber, varianceItems, totalVarianceUnits },
    });
  } catch (err) {
    console.error("createAuditLogEntry failed after submitStockCount", err);
  }

  try {
    await refreshDashboardStats(storeId);
  } catch (err) {
    console.error("refreshDashboardStats failed after submitStockCount", err);
  }

  try {
    await createNotifications({
      storeId,
      kind: "STOCK_COUNT",
      title: `Stock count completed · ${count.countNumber}`,
      body: `${user.fullName} reconciled ${varianceItems} item(s) (${totalVarianceUnits} unit variance).`,
      link: "/stock-counts",
      refType: "STOCK_COUNT",
      refId: count.id,
      branchId: count.branchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      toBranch: count.branchId,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after submitStockCount", err);
  }

  return { countId: count.id, status: "COMPLETED", varianceItems, totalVarianceUnits };
});

/** Abandon an open count without posting any variances. Manager+. */
export const cancelStockCount = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { countId, reason } = request.data as { countId: string; reason?: string };
  if (!countId) throw invalidArgument("countId is required");

  const ref = collection(storeId, "stockCounts").doc(countId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Stock count not found");
  const count = { id: snap.id, ...snap.data() } as StockCount;

  if (count.status !== "IN_PROGRESS") throw failedPrecondition(`Stock count is ${count.status}`);
  assertBranchAccess(user, count.branchId);

  await ref.update({
    status: "CANCELLED",
    cancelledBy: uid,
    cancelledByName: user.fullName,
    cancelledAt: now(),
    cancelReason: reason?.trim() || null,
    updatedAt: now(),
  });

  return { countId: count.id, status: "CANCELLED" };
});
