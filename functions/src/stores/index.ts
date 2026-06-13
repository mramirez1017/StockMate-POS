import { onCall } from "firebase-functions/v2/https";
import { Product } from "@stockmate/types";
import { isPlatformOwnerUid, resolveAuth, requireAdmin } from "../utils/auth";
import { collection, db, now, stripUndefined } from "../utils/firestore";
import { permissionDenied, invalidArgument, failedPrecondition } from "../utils/errors";
import { getOrCreateInventory } from "../utils/stock";

export const createStore = onCall(async (request) => {
  if (!request.auth?.uid) throw permissionDenied();

  const platformOwner = await isPlatformOwnerUid(request.auth.uid);
  if (!platformOwner) {
    throw permissionDenied("Only platform owner can create stores");
  }

  const { name, branchName, address, phone } = request.data as {
    name: string;
    branchName?: string;
    address?: string;
    phone?: string;
  };

  if (!name?.trim()) throw invalidArgument("Store name is required");

  const storeRef = db.collection("stores").doc();
  const branchId = "branch-main";
  const ts = now();

  const batch = db.batch();

  batch.set(storeRef, {
    name: name.trim(),
    address,
    phone,
    taxRate: 0,
    taxInclusive: true,
    currency: "PHP",
    paymentMethods: ["Cash", "Card", "GCash"],
    receiptHeader: name.trim(),
    receiptFooter: "Thank you for your purchase!",
    createdAt: ts,
    updatedAt: ts,
  });

  batch.set(storeRef.collection("branches").doc(branchId), {
    storeId: storeRef.id,
    name: branchName?.trim() || "Main Branch",
    address,
    phone,
    status: "ACTIVE",
    createdAt: ts,
    updatedAt: ts,
  });

  batch.set(storeRef.collection("dashboardStats").doc("main"), {
    todaySales: 0,
    todayTransactions: 0,
    criticalStockCount: 0,
    lowStockCount: 0,
    pendingDeliveries: 0,
    partialDeliveries: 0,
    inventoryValue: 0,
    todayProfit: 0,
    updatedAt: ts,
  });

  await batch.commit();

  return { storeId: storeRef.id, branchId };
});

/** Store admin — add a new branch location and initialize empty inventory rows */
export const createBranch = onCall(async (request) => {
  const { storeId, user } = await resolveAuth(request);
  requireAdmin(user);

  const { name, address, phone } = request.data as {
    name: string;
    address?: string;
    phone?: string;
  };

  if (!name?.trim()) throw invalidArgument("Branch name is required");

  const branchRef = collection(storeId, "branches").doc();
  const ts = now();

  await branchRef.set(
    stripUndefined({
      storeId,
      name: name.trim(),
      address: address?.trim(),
      phone: phone?.trim(),
      status: "ACTIVE",
      createdAt: ts,
      updatedAt: ts,
    })
  );

  const productsSnap = await collection(storeId, "products").where("status", "==", "ACTIVE").get();
  for (const doc of productsSnap.docs) {
    const product = { id: doc.id, ...doc.data() } as Product;
    try {
      await getOrCreateInventory(storeId, branchRef.id, product, 0);
    } catch (err) {
      console.error(`createBranch: inventory init failed for product ${doc.id}`, err);
      throw err;
    }
  }

  return { branchId: branchRef.id };
});

/** Store admin — deactivate a branch (soft delete) */
export const deactivateBranch = onCall(async (request) => {
  const { storeId, user } = await resolveAuth(request);
  requireAdmin(user);

  const { branchId } = request.data as { branchId: string };
  if (!branchId) throw invalidArgument("branchId is required");

  const activeSnap = await collection(storeId, "branches").where("status", "==", "ACTIVE").get();
  if (activeSnap.size <= 1) {
    throw failedPrecondition("Cannot deactivate the only active branch");
  }

  const usersSnap = await collection(storeId, "users").where("branchId", "==", branchId).get();
  const hasActiveStaff = usersSnap.docs.some((d) => d.data().status === "ACTIVE");
  if (hasActiveStaff) {
    throw failedPrecondition("Reassign or deactivate staff on this branch before deactivating it");
  }

  await collection(storeId, "branches").doc(branchId).update({
    status: "INACTIVE",
    updatedAt: now(),
  });

  return { success: true };
});
