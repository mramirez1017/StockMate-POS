import { onCall } from "firebase-functions/v2/https";
import { ApplyPromoResult, CartItemInput, Product, Promo, SaleItem } from "@stockmate/types";
import { resolveAuth } from "../utils/auth";
import { collection } from "../utils/firestore";
import { invalidArgument } from "../utils/errors";

export function calculatePromoDiscount(
  promos: Promo[],
  products: Map<string, Product>,
  cartItems: CartItemInput[],
  branchId: string
): ApplyPromoResult {
  const saleItems: SaleItem[] = [];
  let totalDiscount = 0;
  const appliedPromoIds: string[] = [];
  const today = new Date().toISOString().split("T")[0];

  const activePromos = promos.filter(
    (p) =>
      p.status === "ACTIVE" &&
      p.startDate <= today &&
      p.endDate >= today &&
      (!p.branchId || p.branchId === branchId) &&
      (!p.usageLimit || (p.usageCount ?? 0) < p.usageLimit)
  );

  for (const cart of cartItems) {
    const product = products.get(cart.productId);
    if (!product) continue;

    let unitPrice = product.sellingPrice;
    let discount = 0;
    let promoId: string | undefined;

    const applicable = activePromos.filter(
      (p) =>
        (p.productId && p.productId === cart.productId) ||
        (p.categoryId && p.categoryId === product.categoryId)
    );

    for (const promo of applicable) {
      if (promo.minQuantity && cart.quantity < promo.minQuantity) continue;

      switch (promo.type) {
        case "PERCENTAGE":
          discount = (unitPrice * cart.quantity * promo.discountValue) / 100;
          promoId = promo.id;
          break;
        case "FIXED":
          discount = Math.min(promo.discountValue * cart.quantity, unitPrice * cart.quantity);
          promoId = promo.id;
          break;
        case "PROMO_PRICE":
          discount = (unitPrice - promo.discountValue) * cart.quantity;
          unitPrice = promo.discountValue;
          promoId = promo.id;
          break;
        case "BUY_X_GET_Y": {
          const buy = promo.buyQuantity ?? 1;
          const get = promo.getQuantity ?? 1;
          const freeItems = Math.floor(cart.quantity / (buy + get)) * get;
          discount = freeItems * unitPrice;
          promoId = promo.id;
          break;
        }
      }

      if (discount > 0 && !appliedPromoIds.includes(promo.id)) {
        appliedPromoIds.push(promo.id);
      }
      break;
    }

    const lineTotal = unitPrice * cart.quantity - discount;
    totalDiscount += discount;
    saleItems.push({
      productId: cart.productId,
      productName: product.name,
      quantity: cart.quantity,
      unitPrice,
      discount,
      lineTotal,
      promoId,
    });
  }

  return { items: saleItems, totalDiscount, appliedPromoIds };
}

export const applyPromo = onCall(async (request) => {
  const { storeId } = await resolveAuth(request);
  const { branchId, items } = request.data as {
    branchId: string;
    items: CartItemInput[];
  };

  if (!branchId || !items?.length) {
    throw invalidArgument("branchId and items are required");
  }

  const [promosSnap, productsSnap] = await Promise.all([
    collection(storeId, "promos").where("status", "==", "ACTIVE").get(),
    collection(storeId, "products").where("status", "==", "ACTIVE").get(),
  ]);

  const promos = promosSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Promo));
  const products = new Map<string, Product>();
  productsSnap.docs.forEach((d) => products.set(d.id, { id: d.id, ...d.data() } as Product));

  return calculatePromoDiscount(promos, products, items, branchId);
});
