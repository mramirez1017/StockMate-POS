import { collection, now } from "../utils/firestore";
import { updateCriticalStockForProduct } from "../utils/stock";

export async function recordInitialStockMovement(
  storeId: string,
  branchId: string,
  productId: string,
  productName: string,
  quantity: number,
  userId: string
): Promise<void> {
  if (quantity <= 0) return;

  await collection(storeId, "stockMovements").doc().set({
    storeId,
    branchId,
    productId,
    productName,
    type: "ADJUSTMENT",
    quantityChange: quantity,
    previousStock: 0,
    newStock: quantity,
    remarks: "Initial stock on product create",
    createdBy: userId,
    createdAt: now(),
  });

  await updateCriticalStockForProduct(storeId, branchId, productId);
}
