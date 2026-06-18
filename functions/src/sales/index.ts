import { onCall } from "firebase-functions/v2/https";
import { CartItemInput, Product, Promo, Sale, SalePayment } from "@stockmate/types";
import { resolveAuth, requirePosAccess, assertBranchAccess, canChangePrice } from "../utils/auth";
import { collection, db, now, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument, permissionDenied } from "../utils/errors";
import { adjustStockBatch, refreshDashboardStats, updateCriticalStockForProduct } from "../utils/stock";
import { calculatePromoDiscount } from "../promos";

const PWD_SENIOR_DISCOUNT_RATE = 0.2;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

type PaymentInput = { method: string; amount: number; reference?: string };

/** Normalize the optional split-payment input into validated tenders. */
function normalizePayments(raw: unknown): SalePayment[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const payments: SalePayment[] = [];
  for (const entry of raw as PaymentInput[]) {
    const method = String(entry?.method ?? "").trim().toUpperCase();
    const amount = roundMoney(Number(entry?.amount));
    if (!method || !Number.isFinite(amount) || amount <= 0) {
      throw invalidArgument("Each split payment needs a method and a positive amount");
    }
    const reference = entry?.reference?.toString().trim() || undefined;
    if (method === "GCASH" && !reference) {
      throw invalidArgument("GCash split payment requires a reference number");
    }
    payments.push({ method, amount, reference });
  }
  return payments;
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
    manualDiscount: manualDiscountRaw,
    manualDiscountReason,
    payments: paymentsRaw,
  } = request.data as {
    branchId: string;
    items: CartItemInput[];
    paymentMethod: string;
    customerEmail?: string;
    customerPhone?: string;
    pwdOrSeniorDiscount?: boolean;
    amountTendered?: number;
    paymentReference?: string;
    manualDiscount?: number;
    manualDiscountReason?: string;
    payments?: PaymentInput[];
  };

  const splitPayments = normalizePayments(paymentsRaw);

  if (!branchId || !items?.length || (!paymentMethod && !splitPayments)) {
    throw invalidArgument("branchId, items, and paymentMethod are required");
  }

  const method = splitPayments
    ? splitPayments.length === 1
      ? splitPayments[0].method
      : "SPLIT"
    : paymentMethod.toUpperCase();
  const gcashRef = paymentReference?.trim();

  if (!splitPayments && method === "GCASH" && !gcashRef) {
    throw invalidArgument("GCash reference number is required");
  }

  // A manual override discount is a price change — gate it behind the same permission.
  const manualDiscount = roundMoney(Math.max(0, Number(manualDiscountRaw) || 0));
  if (manualDiscount > 0 && !canChangePrice(user)) {
    throw permissionDenied("You do not have permission to apply a manual discount");
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
  const afterSenior = netAfterPromo - pwdSeniorDiscountAmount;
  const appliedManualDiscount = Math.min(manualDiscount, Math.max(0, afterSenior));
  const total = roundMoney(afterSenior - appliedManualDiscount);
  const tax = 0;

  let changeGiven: number | undefined;
  if (splitPayments) {
    const totalPaid = roundMoney(splitPayments.reduce((s, p) => s + p.amount, 0));
    if (Math.round(totalPaid * 100) < Math.round(total * 100)) {
      throw invalidArgument("Split payments must cover at least the total due");
    }
    const overpay = roundMoney(totalPaid - total);
    // Only cash tenders can give change back.
    const hasCash = splitPayments.some((p) => p.method === "CASH");
    if (overpay > 0 && !hasCash) {
      throw invalidArgument("Non-cash payments must total exactly the amount due");
    }
    changeGiven = overpay > 0 ? overpay : undefined;
  } else if (method === "CASH") {
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
    manualDiscount: appliedManualDiscount > 0 ? appliedManualDiscount : undefined,
    manualDiscountReason: appliedManualDiscount > 0 ? manualDiscountReason?.trim() || undefined : undefined,
    pwdOrSeniorDiscount: pwdOrSeniorDiscount === true ? true : undefined,
    pwdSeniorDiscountAmount: pwdSeniorDiscountAmount > 0 ? pwdSeniorDiscountAmount : undefined,
    tax,
    total,
    paymentMethod: method,
    payments: splitPayments && splitPayments.length > 1 ? splitPayments : undefined,
    paymentReference: !splitPayments && method === "GCASH" ? gcashRef : undefined,
    amountTendered: !splitPayments && method === "CASH" ? roundMoney(Number(amountTendered)) : undefined,
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
