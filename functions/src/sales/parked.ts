import { onCall } from "firebase-functions/v2/https";
import { ParkedSale, ParkedSaleItem, Product } from "@stockmate/types";
import { resolveAuth, requirePosAccess, assertBranchAccess } from "../utils/auth";
import { collection, now, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument, notFound } from "../utils/errors";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Suspend the current cart so it can be resumed later. POS access. */
export const parkSale = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requirePosAccess(user);

  const { branchId, items, label, note, customerName } = request.data as {
    branchId: string;
    items: { productId: string; quantity: number }[];
    label?: string;
    note?: string;
    customerName?: string;
  };

  if (!branchId) throw invalidArgument("branchId is required");
  if (!items?.length) throw invalidArgument("Cannot park an empty cart");
  assertBranchAccess(user, branchId);

  const productsSnap = await collection(storeId, "products").where("status", "==", "ACTIVE").get();
  const products = new Map<string, Product>();
  productsSnap.docs.forEach((d) => products.set(d.id, { id: d.id, ...d.data() } as Product));

  const parkedItems: ParkedSaleItem[] = [];
  for (const it of items) {
    const qty = Math.floor(Number(it.quantity));
    const product = products.get(it.productId);
    if (!product || !Number.isFinite(qty) || qty <= 0) continue;
    parkedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: qty,
      unitPrice: product.sellingPrice,
    });
  }
  if (parkedItems.length === 0) throw invalidArgument("No valid items to park");

  const estimatedTotal = round2(parkedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  const ref = collection(storeId, "parkedSales").doc();
  const parked: Omit<ParkedSale, "id"> = {
    storeId,
    branchId,
    label: label?.trim() || `Hold ${new Date().toLocaleTimeString()}`,
    items: parkedItems,
    note: note?.trim() || undefined,
    customerName: customerName?.trim() || undefined,
    itemCount: parkedItems.length,
    estimatedTotal,
    parkedBy: uid,
    parkedByName: user.fullName,
    createdAt: now(),
  };
  await ref.set(stripUndefinedDeep(parked));

  return { parkedSaleId: ref.id, itemCount: parkedItems.length, estimatedTotal };
});

/** Remove a parked cart (after it is resumed or discarded). POS access. */
export const deleteParkedSale = onCall(async (request) => {
  const { storeId, user } = await resolveAuth(request);
  requirePosAccess(user);

  const { parkedSaleId } = request.data as { parkedSaleId: string };
  if (!parkedSaleId) throw invalidArgument("parkedSaleId is required");

  const ref = collection(storeId, "parkedSales").doc(parkedSaleId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Parked sale not found");
  assertBranchAccess(user, (snap.data() as ParkedSale).branchId);

  await ref.delete();
  return { success: true };
});
