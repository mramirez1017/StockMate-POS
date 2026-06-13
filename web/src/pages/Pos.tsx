import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Minus, Plus, Search, Trash2, Barcode, Camera } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Product, Sale, BranchInventory } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import BarcodeScannerModal from "@/components/BarcodeScannerModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import BranchFilter from "@/components/BranchFilter";
import { formatCurrency, formatDate } from "@/lib/format";
import { parseMoney, sanitizeMoneyInput } from "@/lib/moneyInput";
import { estimateSaleTotal, roundMoney, tenderCoversTotal } from "@/lib/posCheckout";
import { formatProductLabel, formatStockDetail, productSearchText } from "@/lib/productUnits";
import { isStoreWideAccess } from "@/lib/branchScope";
import { branchName, useBranches } from "@/lib/useBranches";
import { api } from "@/lib/api";
import { callableErrorMessage } from "@/lib/callableError";
import { shouldOfferCameraScan } from "@/lib/cameraScan";

interface CartLine {
  product: Product;
  quantity: number;
}

const PAYMENT_METHODS = ["CASH", "CARD", "GCASH"] as const;

function SaleTotals({ sale }: { sale: Sale }) {
  return (
    <div className="space-y-1 border-t pt-3 text-sm">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{formatCurrency(sale.subtotal)}</span>
      </div>
      {sale.discount > 0 && (
        <div className="flex justify-between text-emerald-700">
          <span>Promo discount</span>
          <span>-{formatCurrency(sale.discount)}</span>
        </div>
      )}
      {(sale.pwdSeniorDiscountAmount ?? 0) > 0 && (
        <div className="flex justify-between text-emerald-700">
          <span>PWD / Senior (20%)</span>
          <span>-{formatCurrency(sale.pwdSeniorDiscountAmount!)}</span>
        </div>
      )}
      {sale.tax > 0 && (
        <div className="flex justify-between">
          <span>Tax</span>
          <span>{formatCurrency(sale.tax)}</span>
        </div>
      )}
      <div className="flex justify-between text-lg font-bold">
        <span>Total</span>
        <span>{formatCurrency(sale.total)}</span>
      </div>
      <div className="flex justify-between text-slate-500">
        <span>Payment</span>
        <span>{sale.paymentMethod}</span>
      </div>
      {sale.paymentReference && (
        <div className="flex justify-between text-slate-500">
          <span>Reference no.</span>
          <span className="font-mono">{sale.paymentReference}</span>
        </div>
      )}
      {sale.amountTendered != null && (
        <div className="flex justify-between text-slate-500">
          <span>Tendered</span>
          <span>{formatCurrency(sale.amountTendered)}</span>
        </div>
      )}
      {sale.changeGiven != null && (
        <div className="flex justify-between font-medium text-slate-800">
          <span>Change</span>
          <span>{formatCurrency(sale.changeGiven)}</span>
        </div>
      )}
    </div>
  );
}

function findProductByCode(products: Product[], code: string): Product | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  return products.find(
    (p) =>
      p.status === "ACTIVE" &&
      (p.barcode === trimmed || p.internalBarcode === trimmed || p.sku === trimmed),
  );
}

function cartQtyFor(cart: CartLine[], productId: string): number {
  return cart.find((l) => l.product.id === productId)?.quantity ?? 0;
}

function branchStock(stockByProduct: Map<string, number>, productId: string): number {
  return stockByProduct.get(productId) ?? 0;
}

export default function Pos() {
  const { storeId, user, store } = useAuth();
  const { branches } = useBranches(storeId);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [branchId, setBranchId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [pwdOrSenior, setPwdOrSenior] = useState(false);
  const [amountTendered, setAmountTendered] = useState("");
  const [gcashReference, setGcashReference] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const cameraScanEnabled = shouldOfferCameraScan();

  useEffect(() => {
    if (!storeId) return;
    return onSnapshot(
      query(collection(db, "stores", storeId, "products"), where("status", "==", "ACTIVE")),
      (snap) => {
        setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product));
        setLoading(false);
      },
    );
  }, [storeId]);

  useEffect(() => {
    if (!user) return;
    if (user.branchId) {
      setBranchId(user.branchId);
    } else if (branches.length > 0 && !branchId) {
      setBranchId(branches.find((b) => b.status === "ACTIVE")?.id ?? branches[0].id);
    }
  }, [user, branches, branchId]);

  useEffect(() => {
    if (!storeId || !branchId) {
      setInventory([]);
      return;
    }
    return onSnapshot(
      query(
        collection(db, "stores", storeId, "branchInventory"),
        where("branchId", "==", branchId),
      ),
      (snap) => {
        setInventory(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BranchInventory));
      },
    );
  }, [storeId, branchId]);

  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of inventory) {
      map.set(row.productId, row.currentStock);
    }
    return map;
  }, [inventory]);

  useEffect(() => {
    setCart((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.flatMap((line) => {
        const available = branchStock(stockByProduct, line.product.id);
        if (available <= 0) return [];
        if (line.quantity > available) return [{ ...line, quantity: available }];
        return [line];
      });
      if (
        next.length === prev.length &&
        next.every((line, i) => line.quantity === prev[i].quantity)
      ) {
        return prev;
      }
      return next;
    });
  }, [stockByProduct, branchId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products
      .filter((p) => productSearchText(p).includes(q))
      .slice(0, 20);
  }, [products, search]);

  const cartSubtotal = cart.reduce((sum, line) => sum + line.product.sellingPrice * line.quantity, 0);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const checkoutEstimate = useMemo(
    () => estimateSaleTotal(cartSubtotal, pwdOrSenior),
    [cartSubtotal, pwdOrSenior],
  );

  const tenderedAmount = parseMoney(amountTendered);
  const tenderedSufficient =
    tenderedAmount != null && tenderCoversTotal(tenderedAmount, checkoutEstimate.total);
  const changeDue =
    paymentMethod === "CASH" && tenderedSufficient
      ? roundMoney(tenderedAmount! - checkoutEstimate.total)
      : null;

  const openCheckout = () => {
    setError(null);
    setPwdOrSenior(false);
    setAmountTendered("");
    setGcashReference("");
    setPaymentMethod("CASH");
    setCheckoutOpen(true);
  };

  const canComplete =
    paymentMethod === "CASH"
      ? tenderedSufficient
      : paymentMethod === "GCASH"
        ? gcashReference.trim().length > 0
        : true;

  const addProduct = (product: Product) => {
    if (!branchId) {
      setError("Select a branch first.");
      return;
    }

    setCart((prev) => {
      const available = branchStock(stockByProduct, product.id);
      const inCart = cartQtyFor(prev, product.id);

      if (available <= 0) {
        setError(`Out of stock at this branch for ${product.name}.`);
        return prev;
      }
      if (inCart >= available) {
        setError(`Only ${formatStockDetail(product, available)} available at this branch.`);
        return prev;
      }

      setError(null);
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const addProductByCode = (code: string) => {
    if (!branchId) {
      setError("Select a branch first.");
      return;
    }
    const product = findProductByCode(products, code);
    if (!product) {
      setError("No active product found for that barcode or SKU.");
      return;
    }
    addProduct(product);
  };

  const addByBarcode = () => {
    addProductByCode(barcode);
    setBarcode("");
    barcodeRef.current?.focus();
  };

  const handleCameraScan = (code: string) => {
    addProductByCode(code);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const line = cart.find((l) => l.product.id === productId);
    if (!line) return;

    const available = branchStock(stockByProduct, productId);

    if (quantity <= 0) {
      setError(null);
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
      return;
    }

    if (quantity > available) {
      setError(
        `Only ${formatStockDetail(line.product, available)} available at this branch for ${line.product.name}.`,
      );
      return;
    }

    setError(null);
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)));
  };

  const clearCart = () => {
    setCart([]);
    setError(null);
  };

  const handleCheckout = async () => {
    if (!user || !branchId) {
      setError("Select a branch before checkout.");
      return;
    }
    if (cart.length === 0) return;

    if (paymentMethod === "CASH") {
      if (!tenderedSufficient) {
        setError("Amount tendered must be at least the total due.");
        return;
      }
    }

    if (paymentMethod === "GCASH" && !gcashReference.trim()) {
      setError("GCash reference number is required.");
      return;
    }

    setCheckingOut(true);
    setError(null);
    try {
      const result = await api.createSale({
        branchId,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        paymentMethod,
        pwdOrSeniorDiscount: pwdOrSenior || undefined,
        amountTendered: paymentMethod === "CASH" ? tenderedAmount! : undefined,
        paymentReference: paymentMethod === "GCASH" ? gcashReference.trim() : undefined,
      });
      const data = result.data as { saleId: string; sale: Sale };
      setLastSale(data.sale);
      setCart([]);
      setCheckoutOpen(false);
      setPwdOrSenior(false);
      setAmountTendered("");
      setGcashReference("");
    } catch (err) {
      setError(callableErrorMessage(err, "Checkout failed"));
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading || !user) return <LoadingSpinner />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="POS"
        description="Ring up sales from the selected branch. Quantities are limited to stock on hand at that branch."
        compact
      />

      <div className={`grid min-h-0 flex-1 gap-4 lg:grid-cols-5 lg:gap-6 ${cart.length > 0 ? "pb-24 lg:pb-0" : ""}`}>
        {/* Product lookup */}
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-3">
          <div className="card space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              {isStoreWideAccess(user) ? (
                <div className="min-w-[180px] flex-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Branch</label>
                  <BranchFilter
                    branches={branches.filter((b) => b.status === "ACTIVE")}
                    user={user}
                    value={branchId}
                    onChange={setBranchId}
                    showAllOption={false}
                    className="input-field w-full"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Branch:{" "}
                  <span className="font-medium text-slate-900">{branchName(branches, branchId)}</span>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Barcode / SKU</label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    ref={barcodeRef}
                    className="input-field pl-10"
                    placeholder="Scan or type barcode..."
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addByBarcode();
                      }
                    }}
                  />
                </div>
                {cameraScanEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!branchId) {
                        setError("Select a branch first.");
                        return;
                      }
                      setError(null);
                      setScannerOpen(true);
                    }}
                    className="btn-secondary shrink-0 px-3"
                    aria-label="Scan with camera"
                    title="Scan with camera"
                  >
                    <Camera size={20} />
                  </button>
                )}
                <button type="button" onClick={addByBarcode} className="btn-primary shrink-0">
                  Add
                </button>
              </div>
              {cameraScanEnabled && (
                <p className="mt-1.5 text-xs text-slate-500">
                  Tap the camera icon to scan with your phone or tablet.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Search products</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className="input-field pl-10"
                  placeholder="Name, brand, SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="card min-h-0 flex-1 overflow-hidden">
            <p className="mb-3 text-sm font-medium text-slate-700">
              {search.trim() ? "Search results" : "Quick pick"}
            </p>
            <ul className="max-h-[min(420px,50vh)] space-y-2 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <li className="py-8 text-center text-sm text-slate-500">No products found.</li>
              ) : (
                filteredProducts.map((p) => {
                  const available = branchStock(stockByProduct, p.id);
                  const inCart = cartQtyFor(cart, p.id);
                  const canAdd = branchId && available > inCart;
                  return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={!canAdd}
                      onClick={() => addProduct(p)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                        canAdd
                          ? "border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/50"
                          : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{formatProductLabel(p)}</p>
                        <p className="text-xs text-slate-500">
                          {branchId && (
                            <>{available > 0 ? formatStockDetail(p, available) : "Out of stock"}</>
                          )}
                          {p.barcode || p.internalBarcode
                            ? ` · ${p.barcode ?? p.internalBarcode}`
                            : ""}
                        </p>
                      </div>
                      <span className="ml-3 shrink-0 font-semibold text-emerald-700">
                        {formatCurrency(p.sellingPrice)}
                      </span>
                    </button>
                  </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        {/* Cart */}
        <div className="flex min-h-0 flex-col lg:col-span-2">
          <div className="card flex min-h-0 flex-1 flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Cart</h2>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-red-600"
                >
                  <Trash2 size={14} /> Clear
                </button>
              )}
            </div>

            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {cart.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm text-slate-500">
                <p>Cart is empty.</p>
                <p className="mt-1">Scan a barcode or pick a product to start.</p>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {cart.map((line) => {
                  const available = branchStock(stockByProduct, line.product.id);
                  const atMax = line.quantity >= available;
                  return (
                  <li
                    key={line.product.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{formatProductLabel(line.product)}</p>
                      <p className="text-xs text-slate-500">
                        {formatCurrency(line.product.sellingPrice)} each ·{" "}
                        {formatStockDetail(line.product, available)} at branch
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.product.id, line.quantity - 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 active:bg-slate-200"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.product.id, line.quantity + 1)}
                        disabled={atMax}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 active:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold text-slate-800">
                      {formatCurrency(line.product.sellingPrice * line.quantity)}
                    </span>
                  </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                <span className="text-xl font-bold text-slate-900">{formatCurrency(cartSubtotal)}</span>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Promos and discounts are applied at checkout.
              </p>
              <button
                type="button"
                onClick={openCheckout}
                disabled={cart.length === 0 || !branchId}
                className="btn-primary hidden w-full py-3 text-base lg:inline-flex"
              >
                Checkout
              </button>
            </div>
          </div>
        </div>
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgb(15_23_42/0.08)] backdrop-blur safe-bottom lg:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">
                {itemCount} item{itemCount !== 1 ? "s" : ""}
              </p>
              <p className="text-lg font-bold text-slate-900">{formatCurrency(cartSubtotal)}</p>
            </div>
            <button
              type="button"
              onClick={openCheckout}
              disabled={!branchId}
              className="btn-primary shrink-0 px-6"
            >
              Checkout
            </button>
          </div>
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleCameraScan}
      />

      <Modal open={checkoutOpen} onClose={() => !checkingOut && setCheckoutOpen(false)} title="Complete transaction">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Branch: <span className="font-medium text-slate-900">{branchName(branches, branchId)}</span>
          </p>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:border-emerald-300">
            <input
              type="checkbox"
              checked={pwdOrSenior}
              onChange={(e) => setPwdOrSenior(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-emerald-600"
            />
            <div>
              <span className="font-medium text-slate-800">PWD or Senior Citizen discount</span>
              <p className="text-xs text-slate-500">20% off after promos (if applicable)</p>
            </div>
          </label>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Payment method</p>
            <div className="space-y-2">
              {PAYMENT_METHODS.map((method) => (
                <label
                  key={method}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                    paymentMethod === method
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === method}
                    onChange={() => setPaymentMethod(method)}
                    className="text-emerald-600"
                  />
                  <span className="font-medium text-slate-800">{method}</span>
                </label>
              ))}
            </div>
          </div>

          {paymentMethod === "CASH" && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Amount tendered</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-field"
                  placeholder="0.00"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(sanitizeMoneyInput(e.target.value))}
                  autoFocus
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Change</span>
                <span
                  className={`font-semibold ${
                    tenderedAmount != null && !tenderedSufficient
                      ? "text-red-600"
                      : "text-slate-900"
                  }`}
                >
                  {tenderedAmount == null
                    ? "—"
                    : !tenderedSufficient
                      ? "Insufficient"
                      : formatCurrency(changeDue ?? 0)}
                </span>
              </div>
            </div>
          )}

          {paymentMethod === "GCASH" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">GCash reference number *</label>
              <input
                className="input-field font-mono"
                placeholder="Transaction reference"
                value={gcashReference}
                onChange={(e) => setGcashReference(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="space-y-1 rounded-lg border border-slate-100 bg-white px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <span>{formatCurrency(cartSubtotal)}</span>
            </div>
            {checkoutEstimate.pwdSeniorDiscountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>PWD / Senior (20%)</span>
                <span>-{formatCurrency(checkoutEstimate.pwdSeniorDiscountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-bold">
              <span>Total due</span>
              <span>{formatCurrency(checkoutEstimate.total)}</span>
            </div>
            <p className="text-xs text-slate-500">Promo discounts are applied when the transaction completes.</p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => setCheckoutOpen(false)}
              disabled={checkingOut}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkingOut || !canComplete}
              className="btn-primary"
            >
              {checkingOut ? "Processing..." : "Complete transaction"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!lastSale} onClose={() => setLastSale(null)} title="Sale complete">
        {lastSale && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-slate-500">{store?.name}</p>
              <p className="font-mono text-lg font-bold text-slate-900">
                #{lastSale.id.slice(-8).toUpperCase()}
              </p>
              <p className="text-xs text-slate-500">{formatDate(lastSale.createdAt)}</p>
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {lastSale.items.map((item, i) => (
                <li key={i} className="flex justify-between py-2">
                  <span>
                    {item.productName} ×{item.quantity}
                  </span>
                  <span>{formatCurrency(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <SaleTotals sale={lastSale} />
            <button type="button" onClick={() => setLastSale(null)} className="btn-primary w-full">
              New sale
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
