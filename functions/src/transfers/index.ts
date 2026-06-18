import { onCall } from "firebase-functions/v2/https";
import {
  Branch,
  Product,
  StockTransfer,
  StockTransferItem,
  User,
  UserRole,
} from "@stockmate/types";
import {
  resolveAuth,
  requireManagerOrAbove,
  requireAdmin,
  isStoreAdminRole,
} from "../utils/auth";
import { collection, db, now, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument, notFound, failedPrecondition, permissionDenied } from "../utils/errors";
import {
  adjustStockBatch,
  getOrCreateInventory,
  refreshDashboardStats,
  updateCriticalStockForProduct,
} from "../utils/stock";
import { createNotifications } from "../utils/notify";

type TransferItemInput = { productId: string; quantity: number };

function generateTransferNumber(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `TR-${n}`;
}

/** Non-admins may only act on transfers touching their own branch. */
function assertTransferBranchAccess(user: User, branchIds: string[]): void {
  if (isStoreAdminRole(user.role as UserRole | "OWNER")) return;
  if (!user.branchId || !branchIds.includes(user.branchId)) {
    throw permissionDenied("Branch access denied for this transfer");
  }
}

async function branchName(storeId: string, branchId: string): Promise<string> {
  const snap = await collection(storeId, "branches").doc(branchId).get();
  return snap.exists ? ((snap.data() as Branch).name ?? branchId) : branchId;
}

/**
 * Deduct the transfer items from the source branch (the TRANSFER_OUT event)
 * and flip the record to IN_TRANSIT. Runs at approval time (or immediately for
 * an admin-created transfer). Re-validates source stock inside the transaction.
 */
async function dispatchFromSource(
  storeId: string,
  transfer: StockTransfer,
  ref: FirebaseFirestore.DocumentReference,
  actor: { uid: string; name: string },
): Promise<void> {
  await db.runTransaction(async (tx) => {
    await adjustStockBatch(
      tx,
      transfer.items.map((item) => ({
        storeId,
        branchId: transfer.fromBranchId,
        productId: item.productId,
        productName: item.productName,
        quantityChange: -item.quantity,
        type: "TRANSFER_OUT" as const,
        referenceId: transfer.id,
        remarks: `Transfer ${transfer.transferNumber} sent out`,
        userId: actor.uid,
      })),
    );
    tx.update(ref, {
      status: "IN_TRANSIT",
      approvedBy: actor.uid,
      approvedByName: actor.name,
      approvedAt: now(),
      dispatchedBy: actor.uid,
      dispatchedByName: actor.name,
      dispatchedAt: now(),
      updatedAt: now(),
    });
  });

  for (const item of transfer.items) {
    await updateCriticalStockForProduct(storeId, transfer.fromBranchId, item.productId);
  }
  try {
    await refreshDashboardStats(storeId);
  } catch (err) {
    console.error("refreshDashboardStats failed after dispatchFromSource", err);
  }
}

export const createStockTransfer = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { fromBranchId, toBranchId, items, notes } = request.data as {
    fromBranchId: string;
    toBranchId: string;
    items: TransferItemInput[];
    notes?: string;
  };

  if (!fromBranchId || !toBranchId) throw invalidArgument("fromBranchId and toBranchId are required");
  if (fromBranchId === toBranchId) throw invalidArgument("Source and destination branches must differ");
  if (!items?.length) throw invalidArgument("At least one item is required");

  assertTransferBranchAccess(user, [fromBranchId, toBranchId]);

  const transferItems: StockTransferItem[] = [];
  for (const input of items) {
    const qty = Math.floor(Number(input.quantity));
    if (!input.productId || !Number.isFinite(qty) || qty <= 0) {
      throw invalidArgument("Each item needs a product and a quantity greater than zero");
    }
    const productSnap = await collection(storeId, "products").doc(input.productId).get();
    if (!productSnap.exists) throw notFound(`Product ${input.productId} not found`);
    const product = { id: productSnap.id, ...productSnap.data() } as Product;

    // Soft availability check at the source branch (final check happens at approval).
    const { data: inv } = await getOrCreateInventory(storeId, fromBranchId, product, 0);
    if (inv.currentStock < qty) {
      throw failedPrecondition(
        `Not enough ${product.name} at source. Available: ${inv.currentStock}, requested: ${qty}`,
      );
    }
    transferItems.push({ productId: product.id, productName: product.name, quantity: qty });
  }

  // Admins (store owners) skip approval; managers raise a request to approve.
  const adminCreated = isStoreAdminRole(user.role as UserRole | "OWNER");

  const ref = collection(storeId, "stockTransfers").doc();
  const transfer: StockTransfer = {
    id: ref.id,
    storeId,
    transferNumber: generateTransferNumber(),
    fromBranchId,
    toBranchId,
    status: "PENDING_APPROVAL",
    items: transferItems,
    notes,
    requestedBy: uid,
    requestedByName: user.fullName,
    createdAt: now(),
    updatedAt: now(),
  };
  await ref.set(stripUndefinedDeep({ ...transfer, id: undefined }));

  const fromName = await branchName(storeId, fromBranchId);

  if (adminCreated) {
    // Auto-approve: deduct from source immediately and notify the destination.
    await dispatchFromSource(storeId, transfer, ref, { uid, name: user.fullName });
    try {
      await createNotifications({
        storeId,
        kind: "STOCK_TRANSFER",
        title: `Transfer in transit · ${transfer.transferNumber}`,
        body: `${user.fullName} sent ${transferItems.length} item(s) from ${fromName}. Confirm receipt when it arrives.`,
        link: `/transfers`,
        refType: "STOCK_TRANSFER",
        refId: ref.id,
        branchId: transfer.toBranchId,
        actorId: uid,
        actorName: user.fullName,
        toAdmins: true,
        toBranch: transfer.toBranchId,
        excludeUid: uid,
      });
    } catch (err) {
      console.error("createNotifications failed after admin createStockTransfer", err);
    }
    return { transferId: ref.id, transferNumber: transfer.transferNumber, status: "IN_TRANSIT" };
  }

  // Manager request → notify admins for approval.
  try {
    await createNotifications({
      storeId,
      kind: "STOCK_TRANSFER",
      title: `Transfer needs approval · ${transfer.transferNumber}`,
      body: `${user.fullName} requested ${transferItems.length} item(s) from ${fromName}. Approve to send it out.`,
      link: `/transfers`,
      refType: "STOCK_TRANSFER",
      refId: ref.id,
      branchId: fromBranchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after createStockTransfer", err);
  }

  return { transferId: ref.id, transferNumber: transfer.transferNumber, status: transfer.status };
});

/** Admin approves a pending request → stock leaves the source branch. Admin only. */
export const approveStockTransfer = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireAdmin(user);

  const { transferId } = request.data as { transferId: string };
  if (!transferId) throw invalidArgument("transferId is required");

  const ref = collection(storeId, "stockTransfers").doc(transferId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Transfer not found");
  const transfer = { id: snap.id, ...snap.data() } as StockTransfer;

  if (transfer.status !== "PENDING_APPROVAL") throw failedPrecondition(`Transfer is ${transfer.status}`);

  await dispatchFromSource(storeId, transfer, ref, { uid, name: user.fullName });

  const fromName = await branchName(storeId, transfer.fromBranchId);
  try {
    await createNotifications({
      storeId,
      kind: "STOCK_TRANSFER",
      title: `Transfer approved · ${transfer.transferNumber}`,
      body: `${user.fullName} approved the transfer from ${fromName}. Confirm receipt when it arrives.`,
      link: `/transfers`,
      refType: "STOCK_TRANSFER",
      refId: transfer.id,
      branchId: transfer.toBranchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      toBranch: transfer.toBranchId,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after approveStockTransfer", err);
  }

  return { transferId: transfer.id, status: "IN_TRANSIT" };
});

/** Admin rejects a pending request → no stock movement. Admin only. */
export const rejectStockTransfer = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireAdmin(user);

  const { transferId, reason } = request.data as { transferId: string; reason?: string };
  if (!transferId) throw invalidArgument("transferId is required");

  const ref = collection(storeId, "stockTransfers").doc(transferId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Transfer not found");
  const transfer = { id: snap.id, ...snap.data() } as StockTransfer;

  if (transfer.status !== "PENDING_APPROVAL") throw failedPrecondition(`Transfer is ${transfer.status}`);

  await ref.update({
    status: "REJECTED",
    rejectedBy: uid,
    rejectedByName: user.fullName,
    rejectedAt: now(),
    rejectReason: reason?.trim() || null,
    updatedAt: now(),
  });

  try {
    await createNotifications({
      storeId,
      kind: "STOCK_TRANSFER",
      title: `Transfer rejected · ${transfer.transferNumber}`,
      body: `${user.fullName} rejected the transfer request${reason ? ` — ${reason}` : "."}`,
      link: `/transfers`,
      refType: "STOCK_TRANSFER",
      refId: transfer.id,
      branchId: transfer.fromBranchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      toBranch: transfer.fromBranchId,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after rejectStockTransfer", err);
  }

  return { transferId: transfer.id, status: "REJECTED" };
});

export const receiveStockTransfer = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { transferId, items } = request.data as {
    transferId: string;
    items?: { productId: string; receivedQty: number }[];
  };
  if (!transferId) throw invalidArgument("transferId is required");

  const ref = collection(storeId, "stockTransfers").doc(transferId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Transfer not found");
  const transfer = { id: snap.id, ...snap.data() } as StockTransfer;

  if (transfer.status !== "IN_TRANSIT") throw failedPrecondition(`Transfer is ${transfer.status}`);
  assertTransferBranchAccess(user, [transfer.toBranchId]);

  const receivedMap = new Map<string, number>();
  (items ?? []).forEach((i) => receivedMap.set(i.productId, Math.floor(Number(i.receivedQty))));

  const receivedItems: StockTransferItem[] = transfer.items.map((item) => {
    const r = receivedMap.has(item.productId) ? receivedMap.get(item.productId)! : item.quantity;
    const receivedQty = Number.isFinite(r) ? Math.max(0, Math.min(item.quantity, r)) : item.quantity;
    return { ...item, receivedQty };
  });

  // Ensure destination inventory documents exist before the transaction.
  for (const item of receivedItems) {
    if ((item.receivedQty ?? 0) <= 0) continue;
    const productSnap = await collection(storeId, "products").doc(item.productId).get();
    if (!productSnap.exists) throw notFound(`Product ${item.productId} not found`);
    await getOrCreateInventory(
      storeId,
      transfer.toBranchId,
      { id: productSnap.id, ...productSnap.data() } as Product,
      0,
    );
  }

  await db.runTransaction(async (tx) => {
    await adjustStockBatch(
      tx,
      receivedItems
        .filter((item) => (item.receivedQty ?? 0) > 0)
        .map((item) => ({
          storeId,
          branchId: transfer.toBranchId,
          productId: item.productId,
          productName: item.productName,
          quantityChange: item.receivedQty ?? 0,
          type: "TRANSFER_IN" as const,
          referenceId: transfer.id,
          remarks: `Transfer ${transfer.transferNumber} received`,
          userId: uid,
        })),
    );
    tx.update(ref, {
      status: "COMPLETED",
      items: receivedItems,
      receivedBy: uid,
      receivedByName: user.fullName,
      receivedAt: now(),
      updatedAt: now(),
    });
  });

  for (const item of receivedItems) {
    await updateCriticalStockForProduct(storeId, transfer.toBranchId, item.productId);
  }
  try {
    await refreshDashboardStats(storeId);
  } catch (err) {
    console.error("refreshDashboardStats failed after receiveStockTransfer", err);
  }

  const toName = await branchName(storeId, transfer.toBranchId);
  try {
    await createNotifications({
      storeId,
      kind: "STOCK_TRANSFER",
      title: `Transfer received · ${transfer.transferNumber}`,
      body: `${user.fullName} received the transfer at ${toName}.`,
      link: `/transfers`,
      refType: "STOCK_TRANSFER",
      refId: transfer.id,
      branchId: transfer.fromBranchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      toBranch: transfer.fromBranchId,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after receiveStockTransfer", err);
  }

  return { transferId: transfer.id, status: "COMPLETED" };
});

export const cancelStockTransfer = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireManagerOrAbove(user);

  const { transferId, reason } = request.data as { transferId: string; reason?: string };
  if (!transferId) throw invalidArgument("transferId is required");

  const ref = collection(storeId, "stockTransfers").doc(transferId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Transfer not found");
  const transfer = { id: snap.id, ...snap.data() } as StockTransfer;

  if (transfer.status !== "PENDING_APPROVAL" && transfer.status !== "IN_TRANSIT") {
    throw failedPrecondition(`Transfer is ${transfer.status}`);
  }
  assertTransferBranchAccess(user, [transfer.fromBranchId, transfer.toBranchId]);

  const wasInTransit = transfer.status === "IN_TRANSIT";

  await db.runTransaction(async (tx) => {
    if (wasInTransit) {
      // Return the in-transit stock back to the source branch.
      await adjustStockBatch(
        tx,
        transfer.items.map((item) => ({
          storeId,
          branchId: transfer.fromBranchId,
          productId: item.productId,
          productName: item.productName,
          quantityChange: item.quantity,
          type: "TRANSFER_IN" as const,
          referenceId: transfer.id,
          remarks: `Transfer ${transfer.transferNumber} cancelled — returned to source`,
          userId: uid,
        })),
      );
    }
    tx.update(ref, {
      status: "CANCELLED",
      cancelledBy: uid,
      cancelledByName: user.fullName,
      cancelledAt: now(),
      cancelReason: reason ?? null,
      updatedAt: now(),
    });
  });

  if (wasInTransit) {
    for (const item of transfer.items) {
      await updateCriticalStockForProduct(storeId, transfer.fromBranchId, item.productId);
    }
    try {
      await refreshDashboardStats(storeId);
    } catch (err) {
      console.error("refreshDashboardStats failed after cancelStockTransfer", err);
    }
  }

  try {
    await createNotifications({
      storeId,
      kind: "STOCK_TRANSFER",
      title: `Transfer cancelled · ${transfer.transferNumber}`,
      body: `${user.fullName} cancelled the transfer${reason ? ` — ${reason}` : "."}`,
      link: `/transfers`,
      refType: "STOCK_TRANSFER",
      refId: transfer.id,
      branchId: transfer.fromBranchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      toBranch: transfer.fromBranchId,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after cancelStockTransfer", err);
  }

  return { transferId: transfer.id, status: "CANCELLED" };
});
