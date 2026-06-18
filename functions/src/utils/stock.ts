import {
  BranchInventory,
  Product,
  StockMovement,
  StockMovementType,
} from "@stockmate/types";
import { collection, inventoryDocId, now, stripUndefinedDeep } from "./firestore";
import { failedPrecondition, notFound } from "./errors";

export async function getOrCreateInventory(
  storeId: string,
  branchId: string,
  product: Product,
  initialStock = 0
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: BranchInventory }> {
  const id = inventoryDocId(branchId, product.id);
  const ref = collection(storeId, "branchInventory").doc(id);
  const snap = await ref.get();

  if (snap.exists) {
    return { ref, data: { id, ...snap.data() } as BranchInventory };
  }

  const stock = Math.max(0, Math.floor(initialStock));
  const data: Omit<BranchInventory, "id"> = {
    storeId,
    branchId,
    productId: product.id,
    currentStock: stock,
    reorderLevel: product.reorderLevel ?? 10,
    criticalLevel: product.criticalLevel ?? 5,
    updatedAt: now(),
  };
  await ref.set(data);
  return { ref, data: { id, ...data } };
}

export type StockAdjustmentParams = {
  storeId: string;
  branchId: string;
  productId: string;
  productName: string;
  quantityChange: number;
  type: StockMovementType;
  referenceId?: string;
  remarks?: string;
  userId: string;
};

export async function adjustStockBatch(
  tx: FirebaseFirestore.Transaction,
  adjustments: StockAdjustmentParams[],
): Promise<void> {
  if (adjustments.length === 0) return;

  const invRefs = adjustments.map((params) =>
    collection(params.storeId, "branchInventory").doc(
      inventoryDocId(params.branchId, params.productId),
    ),
  );

  const invSnaps = await Promise.all(invRefs.map((ref) => tx.get(ref)));

  for (let i = 0; i < adjustments.length; i++) {
    const params = adjustments[i];
    const invSnap = invSnaps[i];

    if (!invSnap.exists) {
      throw notFound(`Inventory not found for product ${params.productId}`);
    }

    const inv = invSnap.data() as BranchInventory;
    const previousStock = inv.currentStock;
    const newStock = previousStock + params.quantityChange;

    if (newStock < 0) {
      throw failedPrecondition(
        `Insufficient stock for ${params.productName}. Available: ${previousStock}`,
      );
    }

    tx.update(invRefs[i], { currentStock: newStock, updatedAt: now() });

    const movementRef = collection(params.storeId, "stockMovements").doc();
    const movement: Omit<StockMovement, "id"> = {
      storeId: params.storeId,
      branchId: params.branchId,
      productId: params.productId,
      productName: params.productName,
      type: params.type,
      quantityChange: params.quantityChange,
      previousStock,
      newStock,
      referenceId: params.referenceId,
      remarks: params.remarks,
      createdBy: params.userId,
      createdAt: now(),
    };
    tx.set(movementRef, stripUndefinedDeep(movement));
  }
}

export async function adjustStock(
  tx: FirebaseFirestore.Transaction,
  params: StockAdjustmentParams,
): Promise<{ previousStock: number; newStock: number }> {
  const invRef = collection(params.storeId, "branchInventory").doc(
    inventoryDocId(params.branchId, params.productId),
  );
  const invSnap = await tx.get(invRef);

  if (!invSnap.exists) {
    throw notFound(`Inventory not found for product ${params.productId}`);
  }

  const inv = invSnap.data() as BranchInventory;
  const previousStock = inv.currentStock;
  const newStock = previousStock + params.quantityChange;

  if (newStock < 0) {
    throw failedPrecondition(
      `Insufficient stock for ${params.productName}. Available: ${previousStock}`,
    );
  }

  tx.update(invRef, { currentStock: newStock, updatedAt: now() });

  const movementRef = collection(params.storeId, "stockMovements").doc();
  const movement: Omit<StockMovement, "id"> = {
    storeId: params.storeId,
    branchId: params.branchId,
    productId: params.productId,
    productName: params.productName,
    type: params.type,
    quantityChange: params.quantityChange,
    previousStock,
    newStock,
    referenceId: params.referenceId,
    remarks: params.remarks,
    createdBy: params.userId,
    createdAt: now(),
  };
  tx.set(movementRef, stripUndefinedDeep(movement));

  return { previousStock, newStock };
}

export async function updateCriticalStockForProduct(
  storeId: string,
  branchId: string,
  productId: string
): Promise<void> {
  const invId = inventoryDocId(branchId, productId);
  const invSnap = await collection(storeId, "branchInventory").doc(invId).get();
  if (!invSnap.exists) return;

  const inv = invSnap.data() as BranchInventory;
  const productSnap = await collection(storeId, "products").doc(productId).get();
  const productName = productSnap.exists ? (productSnap.data() as Product).name : "Unknown";

  const critRef = collection(storeId, "criticalStocks").doc(invId);

  if (inv.currentStock <= inv.criticalLevel) {
    await critRef.set({
      id: invId,
      storeId,
      branchId,
      productId,
      productName,
      currentStock: inv.currentStock,
      criticalLevel: inv.criticalLevel,
      reorderLevel: inv.reorderLevel,
      suggestedOrderQty: Math.max(0, inv.reorderLevel - inv.currentStock),
      updatedAt: now(),
    });
  } else {
    await critRef.delete();
  }
}

export async function refreshDashboardStats(storeId: string): Promise<void> {
  const statsRef = collection(storeId, "dashboardStats").doc("main");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const salesQuery: FirebaseFirestore.Query = collection(storeId, "sales").where(
    "createdAt",
    ">=",
    todayStart.getTime()
  );

  const [salesSnap, critSnap, poSnap, invSnap, productsSnap] = await Promise.all([
    salesQuery.get(),
    collection(storeId, "criticalStocks").get(),
    collection(storeId, "purchaseOrders")
      .where("status", "in", ["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"])
      .get(),
    collection(storeId, "branchInventory").get(),
    collection(storeId, "products").where("status", "==", "ACTIVE").get(),
  ]);

  const productMap = new Map<string, Product>();
  productsSnap.docs.forEach((d) => productMap.set(d.id, { id: d.id, ...d.data() } as Product));

  let todaySales = 0;
  let todayProfit = 0;
  let todayTransactions = 0;
  salesSnap.docs.forEach((d) => {
    const sale = d.data();
    // Voided and fully-refunded sales contribute nothing.
    if (sale.status === "VOIDED" || sale.status === "REFUNDED") return;
    if (sale.pendingVoidRequestId) return;
    todayTransactions++;
    const refunded = sale.refundedTotal ?? 0;
    todaySales += (sale.total ?? 0) - refunded;
    sale.items?.forEach((item: { productId: string; quantity: number; lineTotal: number }) => {
      const product = productMap.get(item.productId);
      if (product?.supplierCost) {
        todayProfit += item.lineTotal - product.supplierCost * item.quantity;
      } else {
        todayProfit += item.lineTotal;
      }
    });
    // Reduce profit by net refunds (approximate; ignores per-item cost recovery).
    todayProfit -= refunded;
  });

  let lowStockCount = 0;
  let inventoryValue = 0;
  invSnap.docs.forEach((d) => {
    const inv = d.data() as BranchInventory;
    const product = productMap.get(inv.productId);
    if (!product) return;
    if (inv.currentStock <= inv.reorderLevel && inv.currentStock > inv.criticalLevel) {
      lowStockCount++;
    }
    inventoryValue += inv.currentStock * product.sellingPrice;
  });

  let pendingDeliveries = 0;
  let partialDeliveries = 0;
  poSnap.docs.forEach((d) => {
    const po = d.data();
    if (po.status === "PARTIALLY_RECEIVED") partialDeliveries++;
    else pendingDeliveries++;
  });

  await statsRef.set(
    {
      todaySales,
      todayTransactions,
      todayProfit,
      criticalStockCount: critSnap.size,
      lowStockCount,
      pendingDeliveries,
      partialDeliveries,
      inventoryValue,
      updatedAt: now(),
    },
    { merge: true }
  );
}
