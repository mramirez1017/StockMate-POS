import { onCall } from "firebase-functions/v2/https";
import { CartItemInput, Product, Promo, Sale } from "@stockmate/types";
import { resolveAuth, requirePosAccess, assertBranchAccess } from "../utils/auth";
import { collection, db, now, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument } from "../utils/errors";
import { adjustStockBatch, refreshDashboardStats, updateCriticalStockForProduct } from "../utils/stock";
import { calculatePromoDiscount } from "../promos";

const PWD_SENIOR_DISCOUNT_RATE = 0.2;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export const createSale = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requirePosAccess(user);

  const {
    branchId,
    items,
    paymentMethod,
    customerEmail,
    customerPhone,
    pwdOrSeniorDiscount,
    amountTendered,
    paymentReference,
  } = request.data as {
    branchId: string;
    items: CartItemInput[];
    paymentMethod: string;
    customerEmail?: string;
    customerPhone?: string;
    pwdOrSeniorDiscount?: boolean;
    amountTendered?: number;
    paymentReference?: string;
  };

  if (!branchId || !items?.length || !paymentMethod) {
    throw invalidArgument("branchId, items, and paymentMethod are required");
  }

  const method = paymentMethod.toUpperCase();
  const gcashRef = paymentReference?.trim();

  if (method === "GCASH" && !gcashRef) {
    throw invalidArgument("GCash reference number is required");
  }

  assertBranchAccess(user, branchId);

  const [promosSnap, productsSnap] = await Promise.all([
    collection(storeId, "promos").where("status", "==", "ACTIVE").get(),
    collection(storeId, "products").where("status", "==", "ACTIVE").get(),
  ]);

  const promos = promosSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Promo));
  const products = new Map<string, Product>();
  productsSnap.docs.forEach((d) => products.set(d.id, { id: d.id, ...d.data() } as Product));

  const { items: saleItems, totalDiscount } = calculatePromoDiscount(
    promos,
    products,
    items,
    branchId
  );

  if (saleItems.length === 0) {
    throw invalidArgument("No valid products in cart");
  }

  const subtotal = saleItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const netAfterPromo = subtotal - totalDiscount;
  const pwdSeniorDiscountAmount =
    pwdOrSeniorDiscount === true ? roundMoney(netAfterPromo * PWD_SENIOR_DISCOUNT_RATE) : 0;
  const total = roundMoney(netAfterPromo - pwdSeniorDiscountAmount);
  const tax = 0;

  let changeGiven: number | undefined;
  if (method === "CASH") {
    const tendered = roundMoney(Number(amountTendered));
    if (!Number.isFinite(tendered)) {
      throw invalidArgument("Amount tendered is required for cash payment");
    }
    if (Math.round(tendered * 100) < Math.round(total * 100)) {
      throw invalidArgument("Amount tendered must be at least the total due");
    }
    changeGiven = roundMoney(tendered - total);
  }

  const saleRef = collection(storeId, "sales").doc();
  const sale = stripUndefinedDeep({
    storeId,
    branchId,
    cashierId: uid,
    cashierName: user.fullName,
    items: saleItems,
    subtotal,
    discount: totalDiscount,
    pwdOrSeniorDiscount: pwdOrSeniorDiscount === true ? true : undefined,
    pwdSeniorDiscountAmount: pwdSeniorDiscountAmount > 0 ? pwdSeniorDiscountAmount : undefined,
    tax,
    total,
    paymentMethod: method,
    paymentReference: method === "GCASH" ? gcashRef : undefined,
    amountTendered: method === "CASH" ? roundMoney(Number(amountTendered)) : undefined,
    changeGiven,
    customerEmail,
    customerPhone,
    status: "COMPLETED" as const,
    createdAt: now(),
  }) as Omit<Sale, "id">;

  try {
    await db.runTransaction(async (tx) => {
      await adjustStockBatch(
        tx,
        saleItems.map((item) => ({
          storeId,
          branchId,
          productId: item.productId,
          productName: item.productName,
          quantityChange: -item.quantity,
          type: "SALE" as const,
          referenceId: saleRef.id,
          userId: uid,
        })),
      );
      tx.set(saleRef, sale);
    });
  } catch (err) {
    if (err instanceof Error && "code" in err) throw err;
    console.error("createSale transaction failed", err);
    throw err;
  }

  for (const item of saleItems) {
    await updateCriticalStockForProduct(storeId, branchId, item.productId);
  }
  try {
    await refreshDashboardStats(storeId);
  } catch (err) {
    console.error("refreshDashboardStats failed after sale", err);
  }

  return { saleId: saleRef.id, sale: { id: saleRef.id, ...sale } };
});
