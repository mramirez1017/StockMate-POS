import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where, type Query, type CollectionReference } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveBranch } from "@/contexts/ActiveBranchContext";
import { isStoreWideAccess } from "@/lib/branchScope";
import {
  Sale,
  Disposal,
  Product,
  BranchInventory,
  StockMovement,
  StockMovementType,
  PurchaseOrder,
  DeliveryReceipt,
  StockAdjustment,
  Category,
  Branch,
} from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import TableScroll from "@/components/TableScroll";
import DateRangeBar, { EMPTY_RANGE, isWithinRange, rangeLabel, type DateRange } from "@/components/DateRangeBar";
import { StatTile, InDemandTile, TopRankedTile } from "@/components/AnalyticsTiles";
import { computeSalesAnalytics, type ProductCostInfo } from "@/lib/salesAnalytics";
import { formatCurrency, formatDate } from "@/lib/format";
import { canViewProfit, canViewSupplierCost } from "@/lib/permissions";
import { Search, Receipt, Package, Wallet, TrendingUp, PhilippinePeso, ChevronDown, Building2, Hourglass, Boxes } from "lucide-react";

type ReportType = "sales" | "products" | "critical" | "delivery" | "disposal" | "profit" | "inventory" | "movements" | "aging";

interface AgingRow {
  productId: string;
  productName: string;
  branchName: string;
  stock: number;
  lastSale: number | null;
  daysIdle: number | null;
  capitalValue: number;
  retailValue: number;
  bucket: "FRESH" | "SLOW" | "DEAD";
}

const SLOW_DAYS = 30;
const DEAD_DAYS = 90;

interface MovementRow {
  id: string;
  date: number;
  branchId: string;
  branchName: string;
  type: StockMovementType;
  productName: string;
  barcode: string;
  category: string;
  quantityChange: number;
  newStock: number;
  amount: number | null;
  reference: string;
  detail: string;
  searchText: string;
}

const MOVEMENT_TYPES: { id: StockMovementType | "all"; label: string }[] = [
  { id: "all", label: "All types" },
  { id: "SALE", label: "Sales" },
  { id: "DELIVERY_RECEIVED", label: "Deliveries" },
  { id: "ADJUSTMENT", label: "Adjustments" },
  { id: "DISPOSAL", label: "Disposals" },
  { id: "RETURN", label: "Returns" },
  { id: "TRANSFER_OUT", label: "Transfers out" },
  { id: "TRANSFER_IN", label: "Transfers in" },
];

const TYPE_BADGE: Record<StockMovementType, string> = {
  SALE: "badge-blue",
  DELIVERY_RECEIVED: "badge-green",
  ADJUSTMENT: "badge-purple",
  DISPOSAL: "badge-red",
  RETURN: "badge-yellow",
  TRANSFER_IN: "badge-green",
  TRANSFER_OUT: "badge-blue",
};

function typeLabel(t: StockMovementType): string {
  if (t === "DELIVERY_RECEIVED") return "Delivery";
  if (t === "TRANSFER_IN") return "Transfer in";
  if (t === "TRANSFER_OUT") return "Transfer out";
  return t.charAt(0) + t.slice(1).toLowerCase();
}

export default function Reports() {
  const { storeId, user } = useAuth();
  const { activeBranchId } = useActiveBranch();
  const [report, setReport] = useState<ReportType>("sales");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  // Transaction-history search state
  const [movSearch, setMovSearch] = useState("");
  const [movType, setMovType] = useState<StockMovementType | "all">("all");
  const [movBranch, setMovBranch] = useState("");
  const [movFrom, setMovFrom] = useState("");
  const [movTo, setMovTo] = useState("");

  // Sales-report date range + expandable transactions
  const [salesRange, setSalesRange] = useState<DateRange>(EMPTY_RANGE);
  const [showTxns, setShowTxns] = useState(false);

  const reports: { id: ReportType; label: string; adminOnly?: boolean }[] = [
    { id: "movements", label: "Transaction History" },
    { id: "sales", label: "Sales Report" },
    { id: "products", label: "Product Sales" },
    { id: "critical", label: "Critical Stock" },
    { id: "disposal", label: "Disposal / Expired" },
    { id: "aging", label: "Dead Stock & Aging" },
    { id: "inventory", label: "Inventory Value", adminOnly: true },
    { id: "profit", label: "Profit Report", adminOnly: true },
  ];

  const available = reports.filter((r) => !r.adminOnly || (user && canViewProfit(user)));

  useEffect(() => {
    if (!storeId || !user) return;
    setLoading(true);
    const storeWide = isStoreWideAccess(user);
    // Branch staff only ever see their own branch's records; admins see everything.
    const scoped = (name: string): Query | CollectionReference => {
      const ref = collection(db, "stores", storeId, name);
      return storeWide ? ref : query(ref, where("branchId", "==", user.branchId));
    };
    const byNewest = <T extends { createdAt: number }>(arr: T[]): T[] =>
      arr.sort((a, b) => b.createdAt - a.createdAt);

    const load = async () => {
      const result: Record<string, unknown> = {};
      if (report === "sales" || report === "products" || report === "profit") {
        const [snap, productsSnap, categoriesSnap, branchesSnap] = await Promise.all([
          getDocs(scoped("sales")),
          getDocs(collection(db, "stores", storeId, "products")),
          getDocs(collection(db, "stores", storeId, "categories")),
          getDocs(collection(db, "stores", storeId, "branches")),
        ]);
        const sales = byNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sale)));
        result.sales = sales;
        result.totalRevenue = sales.filter((s) => s.status === "COMPLETED").reduce((a, s) => a + s.total, 0);

        const costMap = new Map<string, ProductCostInfo>();
        productsSnap.docs.forEach((d) => {
          const p = d.data() as Product;
          costMap.set(d.id, { name: p.name, supplierCost: p.supplierCost, categoryId: p.categoryId });
        });
        result.productCosts = costMap;
        const catNames = new Map<string, string>();
        categoriesSnap.docs.forEach((d) => catNames.set(d.id, (d.data() as Category).name));
        result.categoryNames = catNames;
        result.branchList = branchesSnap.docs
          .map((d) => ({ id: d.id, name: (d.data() as Branch).name, status: (d.data() as Branch).status }))
          .filter((b) => b.status !== "INACTIVE");
        if (report === "products") {
          const map = new Map<string, { name: string; qty: number; revenue: number }>();
          sales.forEach((s) => s.items.forEach((i) => {
            const e = map.get(i.productId) ?? { name: i.productName, qty: 0, revenue: 0 };
            e.qty += i.quantity; e.revenue += i.lineTotal;
            map.set(i.productId, e);
          }));
          result.productSales = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
        }
        if (report === "profit" && canViewSupplierCost(user!)) {
          const productsSnap = await getDocs(collection(db, "stores", storeId, "products"));
          const costs = new Map(productsSnap.docs.map((d) => [d.id, (d.data() as Product).supplierCost ?? 0]));
          let profit = 0;
          sales.filter((s) => s.status === "COMPLETED").forEach((s) =>
            s.items.forEach((i) => { profit += i.lineTotal - (costs.get(i.productId) ?? 0) * i.quantity; })
          );
          result.profit = profit;
        }
      }
      if (report === "critical" || report === "inventory") {
        const invSnap = await getDocs(scoped("branchInventory"));
        const inv = invSnap.docs.map((d) => d.data() as BranchInventory);
        if (report === "critical") {
          const productsSnap = await getDocs(collection(db, "stores", storeId, "products"));
          const names = new Map(productsSnap.docs.map((d) => [d.id, (d.data() as Product).name]));
          result.critical = inv
            .filter((i) => i.currentStock <= i.criticalLevel)
            .map((i) => ({
              productId: i.productId,
              productName: names.get(i.productId) ?? i.productId,
              currentStock: i.currentStock,
              criticalLevel: i.criticalLevel,
            }));
        }
        if (report === "inventory") {
          const productsSnap = await getDocs(collection(db, "stores", storeId, "products"));
          const productMap = new Map(
            productsSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Product]),
          );
          const branchesSnap = await getDocs(collection(db, "stores", storeId, "branches"));
          const branchNames = new Map(branchesSnap.docs.map((d) => [d.id, (d.data() as { name: string }).name]));

          let capitalCost = 0;
          let totalProfit = 0;
          let retailValue = 0;
          const inventoryLines: {
            productName: string;
            branchName: string;
            stock: number;
            capitalCost: number;
            profit: number;
          }[] = [];

          inv.forEach((i) => {
            const product = productMap.get(i.productId);
            const cost = product?.supplierCost ?? 0;
            const price = product?.sellingPrice ?? 0;
            const lineCapital = i.currentStock * cost;
            const lineProfit = i.currentStock * (price - cost);
            capitalCost += lineCapital;
            totalProfit += lineProfit;
            retailValue += i.currentStock * price;
            inventoryLines.push({
              productName: product?.name ?? i.productId,
              branchName: branchNames.get(i.branchId) ?? i.branchId,
              stock: i.currentStock,
              capitalCost: lineCapital,
              profit: lineProfit,
            });
          });

          result.capitalCost = capitalCost;
          result.totalProfit = totalProfit;
          result.retailValue = retailValue;
          result.inventoryLines = inventoryLines;
        }
      }
      if (report === "aging") {
        const [invSnap, productsSnap, branchesSnap, movSnap] = await Promise.all([
          getDocs(scoped("branchInventory")),
          getDocs(collection(db, "stores", storeId, "products")),
          getDocs(collection(db, "stores", storeId, "branches")),
          getDocs(scoped("stockMovements")),
        ]);
        const inv = invSnap.docs.map((d) => d.data() as BranchInventory);
        const productMap = new Map(productsSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Product]));
        const branchNames = new Map(branchesSnap.docs.map((d) => [d.id, (d.data() as Branch).name]));

        // Latest SALE movement timestamp per branch+product.
        const lastSaleMap = new Map<string, number>();
        movSnap.docs.forEach((d) => {
          const m = d.data() as StockMovement;
          if (m.type !== "SALE") return;
          const key = `${m.branchId}_${m.productId}`;
          const prev = lastSaleMap.get(key) ?? 0;
          if (m.createdAt > prev) lastSaleMap.set(key, m.createdAt);
        });

        const nowTs = Date.now();
        const rows: AgingRow[] = inv
          .filter((i) => i.currentStock > 0)
          .map((i) => {
            const product = productMap.get(i.productId);
            const cost = product?.supplierCost ?? 0;
            const price = product?.sellingPrice ?? 0;
            const last = lastSaleMap.get(`${i.branchId}_${i.productId}`) ?? null;
            const daysIdle = last ? Math.floor((nowTs - last) / 86400000) : null;
            const idleForBucket = daysIdle ?? Infinity;
            const bucket: AgingRow["bucket"] =
              idleForBucket >= DEAD_DAYS ? "DEAD" : idleForBucket >= SLOW_DAYS ? "SLOW" : "FRESH";
            return {
              productId: i.productId,
              productName: product?.name ?? i.productId,
              branchName: branchNames.get(i.branchId) ?? i.branchId,
              stock: i.currentStock,
              lastSale: last,
              daysIdle,
              capitalValue: i.currentStock * cost,
              retailValue: i.currentStock * price,
              bucket,
            };
          })
          .sort((a, b) => (b.daysIdle ?? Infinity) - (a.daysIdle ?? Infinity));

        result.aging = rows;
        result.agingSummary = {
          deadCount: rows.filter((r) => r.bucket === "DEAD").length,
          slowCount: rows.filter((r) => r.bucket === "SLOW").length,
          deadCapital: rows.filter((r) => r.bucket === "DEAD").reduce((s, r) => s + r.capitalValue, 0),
          deadRetail: rows.filter((r) => r.bucket === "DEAD").reduce((s, r) => s + r.retailValue, 0),
        };
      }
      if (report === "disposal") {
        const snap = await getDocs(scoped("disposals"));
        result.disposals = byNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Disposal)));
      }
      if (report === "movements") {
        const [movSnap, salesSnap, productsSnap, branchesSnap, categoriesSnap, poSnap, drSnap, dispSnap, adjSnap] =
          await Promise.all([
            getDocs(scoped("stockMovements")),
            getDocs(scoped("sales")),
            getDocs(collection(db, "stores", storeId, "products")),
            getDocs(collection(db, "stores", storeId, "branches")),
            getDocs(collection(db, "stores", storeId, "categories")),
            getDocs(scoped("purchaseOrders")),
            getDocs(scoped("deliveryReceipts")),
            getDocs(scoped("disposals")),
            getDocs(scoped("stockAdjustments")),
          ]);

        const products = new Map(productsSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Product]));
        const branchMap = new Map(branchesSnap.docs.map((d) => [d.id, (d.data() as Branch).name]));
        const categoryMap = new Map(categoriesSnap.docs.map((d) => [d.id, (d.data() as Category).name]));
        const sales = new Map(salesSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Sale]));
        const pos = new Map(poSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as PurchaseOrder]));
        const receipts = new Map(drSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as DeliveryReceipt]));
        const disposals = new Map(dispSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Disposal]));
        const adjustments = new Map(adjSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as StockAdjustment]));

        const rows: MovementRow[] = movSnap.docs.map((d) => {
          const m = { id: d.id, ...d.data() } as StockMovement;
          const product = products.get(m.productId);
          const barcode = product?.barcode || product?.internalBarcode || "";
          const category = product?.categoryId ? categoryMap.get(product.categoryId) ?? "" : "";
          let amount: number | null = null;
          let reference = "";
          let detail = "";

          if (m.type === "SALE") {
            const sale = m.referenceId ? sales.get(m.referenceId) : undefined;
            reference = sale ? `OR #${sale.id.slice(-6).toUpperCase()}` : "Sale";
            if (sale) {
              const line = sale.items.find((i) => i.productId === m.productId);
              amount = line ? line.lineTotal : sale.total;
              detail = sale.paymentMethod;
              if (sale.paymentReference) detail += ` · Ref ${sale.paymentReference}`;
            }
          } else if (m.type === "DELIVERY_RECEIVED") {
            const receipt = m.referenceId ? receipts.get(m.referenceId) : undefined;
            const po = receipt ? pos.get(receipt.purchaseOrderId) : undefined;
            reference = po ? `PO ${po.poNumber}` : "Delivery";
            if (receipt?.supplierDeliveryNumber) detail = `DR ${receipt.supplierDeliveryNumber}`;
            if (po?.supplierReferenceNumber) detail += `${detail ? " · " : ""}Ref ${po.supplierReferenceNumber}`;
          } else if (m.type === "DISPOSAL") {
            const disp = m.referenceId ? disposals.get(m.referenceId) : undefined;
            reference = "Disposal";
            detail = disp ? [disp.reason, disp.remarks].filter(Boolean).join(" · ") : (m.remarks ?? "");
          } else if (m.type === "ADJUSTMENT") {
            const adj = m.referenceId ? adjustments.get(m.referenceId) : undefined;
            reference = "Adjustment";
            detail = adj?.reason ?? m.remarks ?? "";
          } else {
            reference = typeLabel(m.type);
            detail = m.remarks ?? "";
          }

          const branchName = branchMap.get(m.branchId) ?? m.branchId;
          const searchText = [
            formatDate(m.createdAt),
            new Date(m.createdAt).toLocaleDateString(),
            branchName,
            typeLabel(m.type),
            m.type,
            m.productName ?? product?.name ?? m.productId,
            barcode,
            category,
            amount != null ? String(amount) : "",
            amount != null ? amount.toFixed(2) : "",
            amount != null ? formatCurrency(amount) : "",
            reference,
            detail,
            m.referenceId ?? "",
            String(m.quantityChange),
            String(m.newStock),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return {
            id: m.id,
            date: m.createdAt,
            branchId: m.branchId,
            branchName,
            type: m.type,
            productName: m.productName ?? product?.name ?? m.productId,
            barcode,
            category,
            quantityChange: m.quantityChange,
            newStock: m.newStock,
            amount,
            reference,
            detail,
            searchText,
          };
        });

        result.movements = rows.sort((a, b) => b.date - a.date);
        result.branchOptions = storeWide
          ? Array.from(branchMap.entries()).map(([id, name]) => ({ id, name }))
          : [{ id: user.branchId ?? "", name: branchMap.get(user.branchId ?? "") ?? "My branch" }];
      }
      setData(result);
      setLoading(false);
    };
    load();
  }, [storeId, user, report]);

  const filteredMovements = useMemo(() => {
    const rows = (data.movements as MovementRow[]) ?? [];
    const tokens = movSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const fromTs = movFrom ? new Date(movFrom).setHours(0, 0, 0, 0) : null;
    const toTs = movTo ? new Date(movTo).setHours(23, 59, 59, 999) : null;
    return rows.filter((r) => {
      if (movType !== "all" && r.type !== movType) return false;
      if (movBranch && r.branchId !== movBranch) return false;
      if (fromTs != null && r.date < fromTs) return false;
      if (toTs != null && r.date > toTs) return false;
      if (tokens.length && !tokens.every((t) => r.searchText.includes(t))) return false;
      return true;
    });
  }, [data.movements, movSearch, movType, movBranch, movFrom, movTo]);

  const storeWide = user ? isStoreWideAccess(user) : false;
  // Admins follow the global branch selector; branch staff are fixed to theirs.
  const mainBranchId = storeWide ? activeBranchId : (user?.branchId ?? "");

  const salesInRange = useMemo(() => {
    const sales = (data.sales as Sale[]) ?? [];
    return sales.filter((s) => isWithinRange(s.createdAt, salesRange));
  }, [data.sales, salesRange]);

  const mainSalesInRange = useMemo(
    () => (mainBranchId ? salesInRange.filter((s) => s.branchId === mainBranchId) : salesInRange),
    [salesInRange, mainBranchId],
  );

  const salesAnalytics = useMemo(() => {
    const costMap = (data.productCosts as Map<string, ProductCostInfo>) ?? new Map();
    const catNames = (data.categoryNames as Map<string, string>) ?? new Map();
    return computeSalesAnalytics(mainSalesInRange, costMap, catNames);
  }, [mainSalesInRange, data.productCosts, data.categoryNames]);

  const overallAnalytics = useMemo(() => {
    const costMap = (data.productCosts as Map<string, ProductCostInfo>) ?? new Map();
    const catNames = (data.categoryNames as Map<string, string>) ?? new Map();
    return computeSalesAnalytics(salesInRange, costMap, catNames);
  }, [salesInRange, data.productCosts, data.categoryNames]);

  const perBranchAnalytics = useMemo(() => {
    const costMap = (data.productCosts as Map<string, ProductCostInfo>) ?? new Map();
    const catNames = (data.categoryNames as Map<string, string>) ?? new Map();
    const list = (data.branchList as { id: string; name: string }[]) ?? [];
    return list
      .map((b) => ({
        branch: b,
        analytics: computeSalesAnalytics(
          salesInRange.filter((s) => s.branchId === b.id),
          costMap,
          catNames,
        ),
      }))
      .sort((a, b) => b.analytics.revenue - a.analytics.revenue);
  }, [salesInRange, data.branchList, data.productCosts, data.categoryNames]);

  const rangedTransactions = useMemo(
    () =>
      mainSalesInRange
        .filter((s) => s.status === "COMPLETED" && !s.pendingVoidRequestId)
        .sort((a, b) => b.createdAt - a.createdAt),
    [mainSalesInRange],
  );

  if (!user) return null;

  const branchNameById = (id: string) =>
    ((data.branchList as { id: string; name: string }[]) ?? []).find((b) => b.id === id)?.name ?? "Selected branch";

  const branchOptions = (data.branchOptions as { id: string; name: string }[]) ?? [];
  const movementTotal = filteredMovements.reduce((a, r) => a + (r.amount ?? 0), 0);
  const showProfit = canViewProfit(user);
  const showCapital = canViewSupplierCost(user);

  return (
    <div>
      <PageHeader title="Reports" />
      <div className="filter-bar-scroll mb-6">
        {available.map((r) => (
          <button key={r.id} onClick={() => setReport(r.id)} className={report === r.id ? "btn-primary" : "btn-secondary"}>{r.label}</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="card">
          {report === "movements" && (
            <div>
              <div className="mb-4 flex flex-col gap-3">
                <div className="relative">
                  <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input-field pl-10"
                    placeholder="Search anything — product, barcode, category, branch, amount, PO #, GCash ref, OR #, date..."
                    value={movSearch}
                    onChange={(e) => setMovSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="input-field min-w-[8.5rem] flex-1 sm:w-auto sm:flex-none" value={movType} onChange={(e) => setMovType(e.target.value as StockMovementType | "all")}>
                    {MOVEMENT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                  <select className="input-field min-w-[8.5rem] flex-1 sm:w-auto sm:flex-none" value={movBranch} onChange={(e) => setMovBranch(e.target.value)}>
                    <option value="">All branches</option>
                    {branchOptions.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <input type="date" className="input-field min-w-0 flex-1 sm:w-auto sm:flex-none" value={movFrom} onChange={(e) => setMovFrom(e.target.value)} aria-label="From date" />
                    <span className="shrink-0 text-sm text-slate-400">to</span>
                    <input type="date" className="input-field min-w-0 flex-1 sm:w-auto sm:flex-none" value={movTo} onChange={(e) => setMovTo(e.target.value)} aria-label="To date" />
                  </div>
                  {(movSearch || movType !== "all" || movBranch || movFrom || movTo) && (
                    <button
                      className="btn-secondary w-full sm:w-auto"
                      onClick={() => { setMovSearch(""); setMovType("all"); setMovBranch(""); setMovFrom(""); setMovTo(""); }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-slate-500">
                    {filteredMovements.length} movement{filteredMovements.length === 1 ? "" : "s"}
                  </span>
                  {movementTotal > 0 && (
                    <span className="font-semibold text-slate-700">
                      Value: <span className="text-brand-600">{formatCurrency(movementTotal)}</span>
                    </span>
                  )}
                </div>
              </div>
              <TableScroll maxHeight="max-h-[calc(100dvh-22rem)]">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="sticky top-0 z-10 border-b bg-white">
                    <tr>
                      <th className="py-2 text-left">Date</th>
                      <th className="py-2 text-left">Type</th>
                      <th className="py-2 text-left">Product</th>
                      <th className="py-2 text-left">Branch</th>
                      <th className="py-2 text-left">Reference</th>
                      <th className="text-right">Change</th>
                      <th className="text-right">Stock After</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400">No movements match your search.</td>
                      </tr>
                    ) : (
                      filteredMovements.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 align-top">
                          <td className="whitespace-nowrap py-2 pr-2 text-slate-500">{formatDate(r.date)}</td>
                          <td className="py-2 pr-2"><span className={TYPE_BADGE[r.type]}>{typeLabel(r.type)}</span></td>
                          <td className="py-2 pr-2">
                            <span className="font-medium text-slate-900">{r.productName}</span>
                            {r.barcode && <span className="block text-xs text-slate-400">{r.barcode}</span>}
                            {r.category && <span className="block text-xs text-slate-400">{r.category}</span>}
                          </td>
                          <td className="py-2 pr-2 text-slate-600">{r.branchName}</td>
                          <td className="py-2 pr-2">
                            <span className="font-medium text-slate-700">{r.reference}</span>
                            {r.detail && <span className="block text-xs text-slate-400">{r.detail}</span>}
                          </td>
                          <td className={`py-2 text-right tabular-nums ${r.quantityChange < 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {r.quantityChange > 0 ? "+" : ""}{r.quantityChange}
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums text-slate-900">{r.newStock}</td>
                          <td className="py-2 text-right tabular-nums">{r.amount != null ? formatCurrency(r.amount) : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          )}
          {report === "sales" && (
            <div>
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    Sales Summary
                    {storeWide && mainBranchId && (
                      <span className="ml-2 align-middle text-sm font-medium text-brand-600">
                        · {branchNameById(mainBranchId)}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Showing {rangeLabel(salesRange)}
                    {storeWide ? " · use the branch selector to switch branch" : ""}
                  </p>
                </div>
                <DateRangeBar value={salesRange} onChange={(r) => { setSalesRange(r); setShowTxns(false); }} className="sm:items-end" />
              </div>

              <div className="stagger-children grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile icon={PhilippinePeso} tint="bg-emerald-100 text-emerald-600" label="Revenue" value={formatCurrency(salesAnalytics.revenue)} />
                {showProfit && (
                  <StatTile icon={TrendingUp} tint="bg-amber-100 text-amber-600" label="Gross profit" value={formatCurrency(salesAnalytics.profit)} />
                )}
                {showCapital && (
                  <StatTile icon={Wallet} tint="bg-violet-100 text-violet-600" label="Capital (COGS)" value={formatCurrency(salesAnalytics.capital)} />
                )}
                <StatTile icon={Package} tint="bg-sky-100 text-sky-600" label="Items sold" value={String(salesAnalytics.itemsSold)} />
                <StatTile
                  icon={Receipt}
                  tint="bg-brand-100 text-brand-600"
                  label="Transactions"
                  value={String(salesAnalytics.transactions)}
                  sub={salesAnalytics.transactions > 0 ? (showTxns ? "Hide details" : "Tap to expand") : undefined}
                  onClick={salesAnalytics.transactions > 0 ? () => setShowTxns((v) => !v) : undefined}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TopRankedTile label="Top 3 in-demand products" items={salesAnalytics.productRanking} />
                <InDemandTile label="In-demand category" item={salesAnalytics.topCategory} />
              </div>

              {showTxns && (
                <div className="mt-4 animate-slide-up rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                    <ChevronDown size={16} /> Transactions ({rangedTransactions.length})
                  </div>
                  <div className="table-scroll max-h-80">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="sticky top-0 z-10 border-b bg-white">
                        <tr>
                          <th className="px-3 py-2 text-left">Receipt</th>
                          <th className="px-3 py-2 text-left">Cashier</th>
                          <th className="px-3 py-2 text-right">Items</th>
                          <th className="px-3 py-2 text-left">Payment</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-left">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rangedTransactions.map((s) => (
                          <tr key={s.id} className="border-b border-slate-100">
                            <td className="px-3 py-2 font-mono text-xs">#{s.id.slice(-8).toUpperCase()}</td>
                            <td className="px-3 py-2 text-slate-600">{s.cashierName}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{s.items.length}</td>
                            <td className="px-3 py-2 text-slate-600">{s.paymentMethod}</td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(s.total)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatDate(s.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {storeWide && (
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Building2 size={18} className="text-brand-600" />
                    <h4 className="text-base font-semibold text-slate-900">Overall — all branches</h4>
                  </div>

                  <div className="stagger-children grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatTile icon={PhilippinePeso} tint="bg-emerald-100 text-emerald-600" label="Total revenue" value={formatCurrency(overallAnalytics.revenue)} />
                    {showProfit && (
                      <StatTile icon={TrendingUp} tint="bg-amber-100 text-amber-600" label="Total profit" value={formatCurrency(overallAnalytics.profit)} />
                    )}
                    <StatTile icon={Receipt} tint="bg-brand-100 text-brand-600" label="Transactions" value={String(overallAnalytics.transactions)} />
                    <StatTile icon={Package} tint="bg-sky-100 text-sky-600" label="Items sold" value={String(overallAnalytics.itemsSold)} />
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <TopRankedTile label="Top 3 products (all branches)" items={overallAnalytics.productRanking} />
                    <InDemandTile label="Top category (all branches)" item={overallAnalytics.topCategory} />
                  </div>

                  <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">By branch</p>
                  <div className="stagger-children grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {perBranchAnalytics.map(({ branch, analytics }) => {
                      const isSelected = branch.id === mainBranchId;
                      return (
                        <div
                          key={branch.id}
                          className={`rounded-xl border p-4 shadow-panel transition ${
                            isSelected ? "border-brand-300 bg-brand-50/40" : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                              <Building2 size={14} className="text-brand-600" />
                              {branch.name}
                            </span>
                            {isSelected && <span className="badge-green">Selected</span>}
                          </div>
                          <p className="text-2xl font-bold text-brand-600">{formatCurrency(analytics.revenue)}</p>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>{analytics.transactions} transactions</span>
                            <span>{analytics.itemsSold} items sold</span>
                            {showProfit && <span className="text-emerald-700">Profit {formatCurrency(analytics.profit)}</span>}
                            {showCapital && <span>Capital {formatCurrency(analytics.capital)}</span>}
                          </div>
                          {analytics.topProduct && (
                            <p className="mt-2 truncate text-xs text-slate-500">
                              <span className="font-medium text-amber-600">In demand:</span> {analytics.topProduct.name} ({analytics.topProduct.quantity})
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {report === "profit" && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Total Profit</h3>
              <p className="text-3xl font-bold text-green-600">{formatCurrency((data.profit as number) ?? 0)}</p>
            </div>
          )}
          {report === "inventory" && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Inventory Value</h3>
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                  <p className="text-sm text-violet-700">Capital cost (COGS basis)</p>
                  <p className="text-2xl font-bold text-violet-700">{formatCurrency((data.capitalCost as number) ?? 0)}</p>
                  <p className="mt-0.5 text-xs text-violet-500">Supplier cost × stock on hand</p>
                </div>
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
                  <p className="text-sm text-sky-700">Retail value</p>
                  <p className="text-2xl font-bold text-sky-700">{formatCurrency((data.retailValue as number) ?? 0)}</p>
                  <p className="mt-0.5 text-xs text-sky-500">Selling price × stock on hand</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm text-emerald-700">Potential profit on hand</p>
                  <p className="text-2xl font-bold text-emerald-700">{formatCurrency((data.totalProfit as number) ?? 0)}</p>
                  <p className="mt-0.5 text-xs text-emerald-500">Retail − capital</p>
                </div>
              </div>
              <TableScroll>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="sticky top-0 z-10 border-b bg-white">
                    <tr>
                      <th className="py-2 text-left">Product</th>
                      <th className="py-2 text-left">Branch</th>
                      <th className="text-right">Stock</th>
                      <th className="text-right">Capital cost</th>
                      <th className="text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((data.inventoryLines as { productName: string; branchName: string; stock: number; capitalCost: number; profit: number }[]) ?? []).map((line, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2">{line.productName}</td>
                        <td className="py-2">{line.branchName}</td>
                        <td className="text-right tabular-nums">{line.stock}</td>
                        <td className="text-right">{formatCurrency(line.capitalCost)}</td>
                        <td className="text-right text-emerald-700">{formatCurrency(line.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          )}
          {report === "products" && (
            <TableScroll>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b bg-white">
                  <tr>
                    <th className="py-2 text-left">Product</th>
                    <th className="text-right">Qty Sold</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {((data.productSales as { name: string; qty: number; revenue: number }[]) ?? []).map((p, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2">{p.name}</td>
                      <td className="text-right">{p.qty}</td>
                      <td className="text-right">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
          {report === "critical" && (
            <ul className="space-y-2">
              {((data.critical as { productId: string; productName: string; currentStock: number; criticalLevel: number }[]) ?? []).map((i) => (
                <li key={i.productId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{i.productName}</span>
                  <span className="shrink-0 font-medium text-red-600">{i.currentStock} / {i.criticalLevel}</span>
                </li>
              ))}
            </ul>
          )}
          {report === "disposal" && (
            <ul className="space-y-2">
              {((data.disposals as Disposal[]) ?? []).map((d) => (
                <li key={d.id} className="flex justify-between text-sm"><span>{d.productName} · {d.reason}</span><span>-{d.quantity}</span></li>
              ))}
            </ul>
          )}
          {report === "aging" && (() => {
            const rows = (data.aging as AgingRow[]) ?? [];
            const summary = (data.agingSummary as { deadCount: number; slowCount: number; deadCapital: number; deadRetail: number }) ?? {
              deadCount: 0,
              slowCount: 0,
              deadCapital: 0,
              deadRetail: 0,
            };
            return (
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Hourglass size={18} className="text-violet-600" />
                  <h3 className="text-lg font-semibold">Dead Stock & Aging</h3>
                  <span className="text-xs text-slate-400">Slow ≥ {SLOW_DAYS}d · Dead ≥ {DEAD_DAYS}d since last sale</span>
                </div>
                <div className="stagger-children mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatTile icon={Boxes} tint="bg-rose-100 text-rose-600" label="Dead items" value={String(summary.deadCount)} />
                  <StatTile icon={Hourglass} tint="bg-amber-100 text-amber-600" label="Slow-moving items" value={String(summary.slowCount)} />
                  {showCapital && (
                    <StatTile icon={Wallet} tint="bg-violet-100 text-violet-600" label="Dead stock at cost" value={formatCurrency(summary.deadCapital)} />
                  )}
                  <StatTile icon={PhilippinePeso} tint="bg-sky-100 text-sky-600" label="Dead stock at retail" value={formatCurrency(summary.deadRetail)} />
                </div>
                <TableScroll maxHeight="max-h-[calc(100dvh-26rem)]">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="sticky top-0 z-10 border-b bg-white">
                      <tr>
                        <th className="py-2 text-left">Product</th>
                        <th className="py-2 text-left">Branch</th>
                        <th className="py-2 text-left">Status</th>
                        <th className="text-right">Stock</th>
                        <th className="text-right">Days idle</th>
                        <th className="text-left">Last sold</th>
                        {showCapital && <th className="text-right">At cost</th>}
                        <th className="text-right">At retail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td colSpan={showCapital ? 8 : 7} className="py-10 text-center text-slate-400">No stock on hand to analyze.</td></tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={`${r.branchName}_${r.productId}`} className="border-b border-slate-100">
                            <td className="py-2 font-medium text-slate-900">{r.productName}</td>
                            <td className="py-2 text-slate-600">{r.branchName}</td>
                            <td className="py-2">
                              <span className={r.bucket === "DEAD" ? "badge-red" : r.bucket === "SLOW" ? "badge-yellow" : "badge-green"}>
                                {r.bucket === "DEAD" ? "Dead" : r.bucket === "SLOW" ? "Slow" : "Fresh"}
                              </span>
                            </td>
                            <td className="text-right tabular-nums">{r.stock}</td>
                            <td className="text-right tabular-nums text-slate-600">{r.daysIdle == null ? "Never sold" : `${r.daysIdle}d`}</td>
                            <td className="py-2 text-slate-500">{r.lastSale ? formatDate(r.lastSale) : "—"}</td>
                            {showCapital && <td className="text-right tabular-nums">{formatCurrency(r.capitalValue)}</td>}
                            <td className="text-right tabular-nums">{formatCurrency(r.retailValue)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
