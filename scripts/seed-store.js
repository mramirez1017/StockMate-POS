/**
 * Seed script for initial store setup.
 * Run: node scripts/seed-store.js
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or firebase emulators
 */
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "stockmate-pos-demo" });
}

const db = admin.firestore();

async function seed() {
  const storeId = "demo-store";
  const branchId = "branch-1";
  const userId = process.env.SEED_USER_ID || "REPLACE_WITH_FIREBASE_AUTH_UID";

  const batch = db.batch();

  batch.set(db.collection("stores").doc(storeId), {
    name: "Demo Store",
    taxRate: 0,
    taxInclusive: true,
    currency: "PHP",
    paymentMethods: ["Cash", "Card", "GCash"],
    receiptHeader: "StockMate Demo Store",
    receiptFooter: "Thank you!",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  batch.set(db.collection("stores").doc(storeId).collection("branches").doc(branchId), {
    storeId,
    name: "Main Branch",
    address: "123 Main St",
    status: "ACTIVE",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  batch.set(db.collection("stores").doc(storeId).collection("users").doc(userId), {
    storeId,
    branchId,
    fullName: "Admin User",
    email: "admin@example.com",
    role: "OWNER",
    status: "ACTIVE",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  batch.set(db.collection("userStoreIndex").doc(userId), { storeId });

  batch.set(db.collection("stores").doc(storeId).collection("categories").doc("cat-1"), {
    storeId,
    name: "Beverages",
    status: "ACTIVE",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  batch.set(db.collection("stores").doc(storeId).collection("dashboardStats").doc("main"), {
    todaySales: 0,
    todayTransactions: 0,
    criticalStockCount: 0,
    lowStockCount: 0,
    pendingDeliveries: 0,
    partialDeliveries: 0,
    inventoryValue: 0,
    todayProfit: 0,
    updatedAt: Date.now(),
  });

  await batch.commit();
  console.log(`Seeded store: ${storeId}, branch: ${branchId}, user: ${userId}`);
}

seed().catch(console.error);
