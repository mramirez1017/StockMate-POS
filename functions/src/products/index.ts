import { onCall } from "firebase-functions/v2/https";
import { Product } from "@stockmate/types";
import { resolveAuth, requireAdmin, requirePosAccess, canChangePrice } from "../utils/auth";
import { collection, generateInternalBarcode, now, stripUndefined } from "../utils/firestore";
import { alreadyExists, invalidArgument, notFound } from "../utils/errors";
import { createAuditLogEntry } from "../audit";
import { getOrCreateInventory, updateCriticalStockForProduct } from "../utils/stock";
import { recordInitialStockMovement } from "./initialStock";

type CreateProductInput = Partial<Product> & {
  branchId?: string;
  initialStock?: number;
};

export const createProduct = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireAdmin(user);

  const data = request.data as CreateProductInput;
  if (!data.name || !data.categoryId || data.sellingPrice == null || !data.unit) {
    throw invalidArgument("name, categoryId, sellingPrice, and unit are required");
  }
  if (!data.branchId) {
    throw invalidArgument("branchId is required — select where this product is located");
  }

  const branchSnap = await collection(storeId, "branches").doc(data.branchId).get();
  if (!branchSnap.exists || branchSnap.data()?.status !== "ACTIVE") {
    throw invalidArgument("Invalid or inactive branch");
  }

  const stockUnit = data.stockUnit?.trim() || data.unit;
  const initialStock = parseInitialStockValue(data.initialStock ?? 0, stockUnit);

  const ref = collection(storeId, "products").doc();
  const productData = stripUndefined({
    storeId,
    name: data.name,
    categoryId: data.categoryId,
    unit: data.unit,
    unitSize: data.unitSize != null && data.unitSize > 0 ? data.unitSize : undefined,
    stockUnit,
    unitsPerPack: data.unitsPerPack != null && data.unitsPerPack > 1 ? Math.floor(data.unitsPerPack) : undefined,
    packLabel: data.unitsPerPack != null && data.unitsPerPack > 1 ? data.packLabel?.trim() || "box" : undefined,
    sellingPrice: data.sellingPrice,
    reorderLevel: data.reorderLevel ?? 10,
    criticalLevel: data.criticalLevel ?? 5,
    status: data.status ?? "ACTIVE",
    barcode: data.barcode,
    internalBarcode: data.internalBarcode,
    sku: data.sku,
    brand: data.brand,
    description: data.description,
    supplierId: data.supplierId,
    supplierCost: data.supplierCost,
    imageUrl: data.imageUrl,
    remarks: data.remarks,
    primaryBranchId: data.branchId,
    createdAt: now(),
    updatedAt: now(),
  });

  await ref.set(productData);
  const fullProduct = { id: ref.id, ...productData } as Product;

  const branches = await collection(storeId, "branches").where("status", "==", "ACTIVE").get();
  for (const branch of branches.docs) {
    const stock = branch.id === data.branchId ? initialStock : 0;
    await getOrCreateInventory(storeId, branch.id, fullProduct, stock);
    await updateCriticalStockForProduct(storeId, branch.id, ref.id);
  }

  if (initialStock > 0) {
    await recordInitialStockMovement(
      storeId,
      data.branchId,
      ref.id,
      String(productData.name),
      initialStock,
      uid
    );
  }

  return { productId: ref.id };
});

function parseInitialStockValue(value: number, stockUnit: string): number {
  const countUnits = new Set(["pcs", "box", "pack", "bottle", "can"]);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (countUnits.has(stockUnit)) return Math.floor(n);
  return Math.round(n * 10) / 10;
}

export const updateProduct = onCall(async (request) => {
  const { storeId, user } = await resolveAuth(request);
  requireAdmin(user);

  const { productId, sellingPrice, supplierCost, primaryBranchId, branchId, initialStock, ...updates } =
    request.data as { productId: string } & Partial<Product> & CreateProductInput;
  if (!productId) throw invalidArgument("productId is required");

  const ref = collection(storeId, "products").doc(productId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Product not found");

  const existing = snap.data() as Product;

  const hasPack = updates.unitsPerPack != null && updates.unitsPerPack > 1;
  const patch = stripUndefined({
    ...updates,
    unitSize: updates.unitSize != null && updates.unitSize > 0 ? updates.unitSize : undefined,
    stockUnit: updates.stockUnit?.trim() || existing.stockUnit || existing.unit,
    // Clear the pack fields explicitly when packaging is removed.
    unitsPerPack: hasPack ? Math.floor(updates.unitsPerPack as number) : null,
    packLabel: hasPack ? updates.packLabel?.trim() || "box" : null,
    supplierCost,
    updatedAt: now(),
  });

  await ref.update(patch);

  return { success: true };
});

export const changeProductPrice = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  if (!canChangePrice(user)) throw invalidArgument("Not authorized to change price");

  const { productId, newPrice } = request.data as { productId: string; newPrice: number };
  if (!productId || newPrice == null || newPrice < 0) {
    throw invalidArgument("productId and valid newPrice are required");
  }

  const ref = collection(storeId, "products").doc(productId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Product not found");

  const previous = snap.data() as Product;
  await ref.update({ sellingPrice: newPrice, updatedAt: now() });

  await createAuditLogEntry({
    storeId,
    action: "PRICE_CHANGE",
    entityType: "product",
    entityId: productId,
    previousValue: { sellingPrice: previous.sellingPrice },
    newValue: { sellingPrice: newPrice },
    performedBy: uid,
    performedByName: user.fullName,
  });

  return { success: true, newPrice };
});

/** Cashier / manager / admin — updates manufacturer barcode only */
export const updateProductBarcode = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requirePosAccess(user);

  const { productId, barcode } = request.data as { productId: string; barcode: string };
  if (!productId) throw invalidArgument("productId is required");

  const trimmed = (barcode ?? "").trim();
  if (!trimmed) throw invalidArgument("barcode is required");

  const ref = collection(storeId, "products").doc(productId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Product not found");

  const existing = snap.data() as Product;
  if (existing.status !== "ACTIVE") {
    throw invalidArgument("Cannot assign barcode to inactive product");
  }

  const col = collection(storeId, "products");
  const [byBarcode, byInternal] = await Promise.all([
    col.where("barcode", "==", trimmed).where("status", "==", "ACTIVE").get(),
    col.where("internalBarcode", "==", trimmed).where("status", "==", "ACTIVE").get(),
  ]);

  const conflict =
    byBarcode.docs.find((d) => d.id !== productId) ??
    byInternal.docs.find((d) => d.id !== productId);
  if (conflict) {
    throw alreadyExists("This barcode is already assigned to another product");
  }

  await ref.update({ barcode: trimmed, updatedAt: now() });

  await createAuditLogEntry({
    storeId,
    action: "BARCODE_ASSIGNED",
    entityType: "product",
    entityId: productId,
    previousValue: { barcode: existing.barcode ?? null },
    newValue: { barcode: trimmed },
    performedBy: uid,
    performedByName: user.fullName,
  });

  return { success: true, barcode: trimmed };
});

export const generateInternalBarcodeFn = onCall(async (request) => {
  const { storeId, user } = await resolveAuth(request);
  requireAdmin(user);

  const { productId } = request.data as { productId: string };
  if (!productId) throw invalidArgument("productId is required");

  const barcode = generateInternalBarcode();
  await collection(storeId, "products").doc(productId).update({
    internalBarcode: barcode,
    updatedAt: now(),
  });

  return { internalBarcode: barcode };
});
