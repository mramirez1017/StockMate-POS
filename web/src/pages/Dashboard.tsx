import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PhilippinePeso,
  ShoppingBag,
  Package,
  TrendingUp,
  Receipt,
  CreditCard,
  Truck,
  Trash2,
  Search,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { onSnapshot, collection, orderBy, where, getDocs } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sale,
  CriticalStock,
  BranchInventory,
  Product,
  Category,
  PurchaseOrder,
  Disposal,
  DisposalReason,
} from "@stockmate/types";
import LoadingSpinner from "@/components/LoadingSpinner";
import DashboardStatCard from "@/components/DashboardStatCard";
import QuickActionTile from "@/components/QuickActionTile";
import Modal from "@/components/Modal";
import TableScroll from "@/components/TableScroll";
import { formatCurrency, formatDate, statusBadgeClass } from "@/lib/format";
import { canViewProfit, isManagerOrAbove } from "@/lib/permissions";
import { branchScopedQuery } from "@/lib/branchScope";
import { api } from "@/lib/api";

function isActiveSale(s: Sale): boolean {
  return s.status === "COMPLETED" && !s.pendingVoidRequestId && !s.voidedAt;
}

type ModalType =
  | "sales"
  | "transactions"
  | "critical"
  | "low"
  | "profit"
  | "inventory"
  | "deliveries"
  | null;

interface StockRow {
  category: string;
  product: string;
  stock: number;
  threshold: number;
  unit?: string;
}

const DISPOSAL_COLORS: Record<string, string> = {
  EXPIRED: "#ef4444",
  DAMAGED: "#f59e0b",
  SPOILED: "#eab308",
  LOST: "#64748b",
  RETURNED_TO_SUPPLIER: "#3b82f6",
  DISPOSED: "#8b5cf6",
  OTHER: "#94a3b8",
};

export default function Dashboard() {
  const { storeId, user } = useAuth();
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [weekSales, setWeekSales] = useState<Sale[]>([]);
  const [criticalStocks, setCriticalStocks] = useState<CriticalStock[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [categories, setCategories] = useState<Map<string, Category>>(new Map());
  const [pendingPOs, setPendingPOs] = useState<PurchaseOrder[]>([]);
  const [disposals, setDisposals] = useState<Disposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const showProfit = user && canViewProfit(user);

  useEffect(() => {
    if (!storeId || !user) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);

    const unsubs = [
      onSnapshot(
        branchScopedQuery(
          collection(db, "stores", storeId, "sales"),
          user,
          where("createdAt", ">=", todayStart.getTime()),
          orderBy("createdAt", "desc")
        ),
        (snap) => setTodaySales(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sale))
      ),
      onSnapshot(
        branchScopedQuery(
          collection(db, "stores", storeId, "sales"),
          user,
          where("createdAt", ">=", weekStart.getTime()),
          orderBy("createdAt", "desc")
        ),
        (snap) => setWeekSales(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sale))
      ),
      onSnapshot(
        branchScopedQuery(collection(db, "stores", storeId, "criticalStocks"), user),
        (snap) => setCriticalStocks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CriticalStock))
      ),
      onSnapshot(
        branchScopedQuery(collection(db, "stores", storeId, "branchInventory"), user),
        (snap) => setInventory(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BranchInventory))
      ),
      onSnapshot(
        branchScopedQuery(
          collection(db, "stores", storeId, "purchaseOrders"),
          user,
          where("status", "in", ["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"])
        ),
        (snap) => setPendingPOs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseOrder))
      ),
      onSnapshot(
        branchScopedQuery(collection(db, "stores", storeId, "disposals"), user),
        (snap) => setDisposals(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Disposal)),
      ),
    ];

    Promise.all([
      getDocs(collection(db, "stores", storeId, "products")),
      getDocs(collection(db, "stores", storeId, "categories")),
    ])
      .then(([prodSnap, catSnap]) => {
        const pMap = new Map<string, Product>();
        prodSnap.docs.forEach((d) => pMap.set(d.id, { id: d.id, ...d.data() } as Product));
        setProducts(pMap);
        const cMap = new Map<string, Category>();
        catSnap.docs.forEach((d) => cMap.set(d.id, { id: d.id, ...d.data() } as Category));
        setCategories(cMap);
      })
      .catch((err) => console.error("Dashboard catalog load failed:", err))
      .finally(() => setLoading(false));

    return () => unsubs.forEach((u) => u());
  }, [storeId, user]);

  useEffect(() => {
    if (!storeId || !user || !isManagerOrAbove(user)) return;
    void api.updateDashboardStats({}).catch(() => {
      // Non-blocking — heals stale dashboardStats for other clients
    });
  }, [storeId, user]);

  const getCategoryName = (productId: string) => {
    const product = products.get(productId);
    if (!product) return "—";
    return categories.get(product.categoryId)?.name ?? "Uncategorized";
  };

  const criticalRows: StockRow[] = useMemo(
    () =>
      criticalStocks.map((item) => ({
        category: getCategoryName(item.productId),
        product: item.productName,
        stock: item.currentStock,
        threshold: item.criticalLevel,
        unit: products.get(item.productId)?.unit,
      })),
    [criticalStocks, products, categories]
  );

  const lowStockRows: StockRow[] = useMemo(
    () =>
      inventory
        .filter((i) => i.currentStock <= i.reorderLevel && i.currentStock > i.criticalLevel)
        .map((i) => {
          const product = products.get(i.productId);
          return {
            category: product ? getCategoryName(i.productId) : "—",
            product: product?.name ?? i.productId,
            stock: i.currentStock,
            threshold: i.reorderLevel,
            unit: product?.unit,
          };
        }),
    [inventory, products, categories]
  );

  const inventoryValueRows = useMemo(
    () =>
      inventory
        .map((i) => {
          const product = products.get(i.productId);
          if (!product) return null;
          return {
            category: getCategoryName(i.productId),
            product: product.name,
            stock: i.currentStock,
            value: i.currentStock * product.sellingPrice,
            unit: product.unit,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b?.value ?? 0) - (a?.value ?? 0)) as {
        category: string;
        product: string;
        stock: number;
        value: number;
        unit: string;
      }[],
    [inventory, products, categories]
  );

  const totalInventoryValue = useMemo(
    () => inventoryValueRows.reduce((sum, row) => sum + row.value, 0),
    [inventoryValueRows],
  );

  const completedToday = useMemo(
    () => todaySales.filter(isActiveSale),
    [todaySales],
  );

  const todayRevenue = useMemo(
    () => completedToday.reduce((sum, s) => sum + s.total, 0),
    [completedToday],
  );

  const todayGrossProfit = useMemo(() => {
    if (!showProfit) return 0;
    return completedToday.reduce((sum, sale) => {
      return (
        sum +
        sale.items.reduce((lineSum, item) => {
          const cost = products.get(item.productId)?.supplierCost ?? 0;
          return lineSum + (item.lineTotal - cost * item.quantity);
        }, 0)
      );
    }, 0);
  }, [completedToday, products, showProfit]);

  const barChartData = useMemo(() => {
    const days: { label: string; date: string; sales: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const total = weekSales
        .filter((s) => isActiveSale(s) && s.createdAt >= d.getTime() && s.createdAt < next.getTime())
        .reduce((sum, s) => sum + s.total, 0);
      days.push({
        label: d.toLocaleDateString("en", { weekday: "short" }),
        date: d.toLocaleDateString(),
        sales: total,
      });
    }
    return days;
  }, [weekSales]);

  const profitRows = useMemo(() => {
    if (!showProfit) return [];
    return completedToday.flatMap((sale) =>
      sale.items.map((item) => {
        const cost = products.get(item.productId)?.supplierCost ?? 0;
        const profit = item.lineTotal - cost * item.quantity;
        return {
          product: item.productName,
          qty: item.quantity,
          revenue: item.lineTotal,
          profit,
        };
      }),
    );
  }, [completedToday, products, showProfit]);

  const itemsSoldToday = useMemo(
    () => completedToday.reduce((sum, s) => sum + s.items.reduce((n, i) => n + i.quantity, 0), 0),
    [completedToday],
  );

  const avgOrderValue = useMemo(() => {
    if (completedToday.length === 0) return 0;
    return completedToday.reduce((sum, s) => sum + s.total, 0) / completedToday.length;
  }, [completedToday]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; category: string; qty: number; sales: number }>();
    weekSales
      .filter(isActiveSale)
      .flatMap((s) => s.items)
      .forEach((item) => {
        const prev = map.get(item.productId);
        const category = getCategoryName(item.productId);
        if (prev) {
          map.set(item.productId, {
            ...prev,
            qty: prev.qty + item.quantity,
            sales: prev.sales + item.lineTotal,
          });
        } else {
          map.set(item.productId, {
            name: item.productName,
            category,
            qty: item.quantity,
            sales: item.lineTotal,
          });
        }
      });
    return Array.from(map.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
  }, [weekSales, products, categories]);

  const monthDisposals = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return disposals.filter((d) => d.createdAt >= start.getTime());
  }, [disposals]);

  const disposalChartData = useMemo(() => {
    const counts = new Map<DisposalReason, number>();
    monthDisposals.forEach((d) => counts.set(d.reason, (counts.get(d.reason) ?? 0) + d.quantity));
    return Array.from(counts.entries()).map(([reason, value]) => ({
      name: reason.replace(/_/g, " "),
      value,
      color: DISPOSAL_COLORS[reason] ?? "#94a3b8",
    }));
  }, [monthDisposals]);

  const disposalTotal = monthDisposals.reduce((sum, d) => sum + d.quantity, 0);

  if (loading) return <LoadingSpinner />;

  const StockTable = ({ rows, thresholdLabel }: { rows: StockRow[]; thresholdLabel: string }) => (
    <TableScroll className="rounded-xl border border-slate-200 bg-white" maxHeight="max-h-[50vh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Product / Item</th>
            <th className="px-4 py-3 text-right">Stock Left</th>
            <th className="px-4 py-3 text-right">{thresholdLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                No items in this category
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{row.category}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{row.product}</td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-red-600">
                    {row.stock}
                    {row.unit ? ` ${row.unit}` : ""}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-500">{row.threshold}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableScroll>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
        <DashboardStatCard
          label="Today's Sales"
          value={formatCurrency(todayRevenue)}
          icon={PhilippinePeso}
          iconBg="bg-emerald-100 text-emerald-600"
          trend="Live today"
          onClick={() => setActiveModal("sales")}
        />
        <DashboardStatCard
          label="Transactions"
          value={String(completedToday.length)}
          icon={ShoppingBag}
          iconBg="bg-sky-100 text-sky-600"
          onClick={() => setActiveModal("transactions")}
        />
        <DashboardStatCard
          label="Items Sold"
          value={String(itemsSoldToday)}
          icon={Package}
          iconBg="bg-violet-100 text-violet-600"
        />
        {showProfit && (
          <DashboardStatCard
            label="Gross Profit"
            value={formatCurrency(todayGrossProfit)}
            icon={TrendingUp}
            iconBg="bg-amber-100 text-amber-600"
            onClick={() => setActiveModal("profit")}
          />
        )}
        <DashboardStatCard
          label="Avg. Order Value"
          value={formatCurrency(avgOrderValue)}
          icon={Receipt}
          iconBg="bg-rose-100 text-rose-600"
        />
      </div>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-12">
        <div className="card xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-heading">Sales Overview</h2>
            <span className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500">This Week</span>
          </div>
          <div className="h-48 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={barChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${v}`} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Sales"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
                />
                <Line type="monotone" dataKey="sales" stroke="#059669" strokeWidth={2.5} dot={{ fill: "#059669", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card xl:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-heading">Critical Stocks</h2>
            <button type="button" onClick={() => setActiveModal("critical")} className="text-xs font-semibold text-brand-600">
              View all
            </button>
          </div>
          {criticalStocks.length === 0 ? (
            <p className="py-8 text-center text-sm text-brand-600">All stocks healthy</p>
          ) : (
            <ul className="max-h-56 space-y-3 overflow-y-auto">
              {criticalStocks.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                    {item.productName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{item.productName}</p>
                    <p className="truncate text-xs text-slate-500">{getCategoryName(item.productId)}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-red-600">Stock: {item.currentStock}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-heading">Upcoming Deliveries</h2>
            <Link to="/deliveries" className="text-xs font-semibold text-brand-600">View all</Link>
          </div>
          {pendingPOs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No pending deliveries</p>
          ) : (
            <ul className="max-h-56 space-y-3 overflow-y-auto">
              {pendingPOs.slice(0, 5).map((po) => {
                const days = Math.ceil(
                  (new Date(po.expectedDeliveryDate).getTime() - Date.now()) / 86400000,
                );
                return (
                  <li key={po.id} className="rounded-lg border border-slate-100 p-3">
                    <p className="text-sm font-semibold text-slate-900">{po.poNumber}</p>
                    <p className="text-xs text-slate-500">Expected {po.expectedDeliveryDate}</p>
                    <span className="mt-2 inline-block rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      {days <= 0 ? "Due now" : days === 1 ? "In 1 day" : `In ${days} days`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-3">
        <div className="card">
          <h2 className="section-heading mb-4">Top Selling Products</h2>
          {topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No sales data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <th className="pb-2">#</th>
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Sold</th>
                    <th className="pb-2 text-right">Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {topProducts.map((row, i) => (
                    <tr key={i}>
                      <td className="py-2.5 text-slate-400">{i + 1}</td>
                      <td className="py-2.5">
                        <p className="font-medium text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.category}</p>
                      </td>
                      <td className="py-2.5 text-right text-slate-600">{row.qty}</td>
                      <td className="py-2.5 text-right font-semibold">{formatCurrency(row.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-heading">Recent Sales</h2>
            <Link to="/sales" className="text-xs font-semibold text-brand-600">View all</Link>
          </div>
          {completedToday.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No sales yet today</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <th className="pb-2">Receipt</th>
                    <th className="pb-2">Total</th>
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Cashier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {completedToday.slice(0, 6).map((sale) => (
                    <tr key={sale.id}>
                      <td className="py-2.5 font-mono text-xs font-semibold text-brand-600">
                        #{sale.id.slice(-8).toUpperCase()}
                      </td>
                      <td className="py-2.5 font-semibold">{formatCurrency(sale.total)}</td>
                      <td className="py-2.5 text-xs text-slate-500">{formatDate(sale.createdAt)}</td>
                      <td className="py-2.5 text-slate-600">{sale.cashierName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="section-heading mb-4">Stock Disposal (This Month)</h2>
          <div className="h-48">
            {disposalChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No disposals recorded</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={disposalChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value">
                    {disposalChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 text-lg font-bold">
                    {disposalTotal}
                  </text>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
        <QuickActionTile to="/pos" icon={CreditCard} title="POS (New Sale)" description="Create new sale / transaction" iconClass="bg-brand-600" />
        <QuickActionTile to="/deliveries" icon={Truck} title="Receive Delivery" description="Verify and receive items" iconClass="bg-sky-500" />
        <QuickActionTile to="/disposal" icon={Trash2} title="Stock Disposal" description="Tag expired/damaged items" iconClass="bg-amber-500" />
        <QuickActionTile to="/inventory" icon={Search} title="Product Search" description="Search product or scan" iconClass="bg-violet-500" />
        <QuickActionTile to="/reports" icon={BarChart3} title="Reports" description="View and export reports" iconClass="bg-teal-600" />
      </div>

      {/* Modals */}
      <Modal open={activeModal === "sales"} onClose={() => setActiveModal(null)} title="Today's Sales" wide>
        <TableScroll className="rounded-xl border border-slate-200 bg-white" maxHeight="max-h-[50vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {completedToday.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No sales today</td>
                </tr>
              ) : (
                completedToday.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">#{sale.id.slice(-8).toUpperCase()}</td>
                    <td className="px-4 py-3">{sale.cashierName}</td>
                    <td className="px-4 py-3">{sale.items.length}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(sale.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(sale.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
        <div className="mt-4 flex justify-between border-t pt-4 text-sm font-semibold">
          <span>Total Revenue</span>
          <span className="text-brand-600">
            {formatCurrency(completedToday.reduce((a, s) => a + s.total, 0))}
          </span>
        </div>
      </Modal>

      <Modal open={activeModal === "transactions"} onClose={() => setActiveModal(null)} title="Today's Transactions" wide>
        <p className="mb-4 text-sm text-slate-500">
          {completedToday.length} active transaction{completedToday.length !== 1 ? "s" : ""} today
        </p>
        <div className="space-y-2">
          {completedToday.map((sale) => (
            <div key={sale.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">#{sale.id.slice(-8).toUpperCase()}</p>
                <p className="text-xs text-slate-500">{sale.paymentMethod} · {sale.items.length} items</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(sale.total)}</p>
                <span className={statusBadgeClass(sale.status)}>{sale.status}</span>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={activeModal === "critical"} onClose={() => setActiveModal(null)} title="Critical Stocks" xl>
        <p className="mb-4 text-sm text-slate-500">
          Products at or below critical level — {criticalRows.length} item{criticalRows.length !== 1 ? "s" : ""}
        </p>
        <StockTable rows={criticalRows} thresholdLabel="Critical Level" />
        <div className="mt-4 text-right">
          <Link to="/inventory" className="btn-primary text-sm" onClick={() => setActiveModal(null)}>
            Go to Inventory
          </Link>
        </div>
      </Modal>

      <Modal open={activeModal === "low"} onClose={() => setActiveModal(null)} title="Low Stocks" xl>
        <p className="mb-4 text-sm text-slate-500">
          Products below reorder level — {lowStockRows.length} item{lowStockRows.length !== 1 ? "s" : ""}
        </p>
        <StockTable rows={lowStockRows} thresholdLabel="Reorder Level" />
      </Modal>

      <Modal open={activeModal === "profit"} onClose={() => setActiveModal(null)} title="Today's Profit Breakdown" wide>
        <TableScroll className="rounded-xl border border-slate-200 bg-white" maxHeight="max-h-[50vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profitRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No profit data today</td>
                </tr>
              ) : (
                profitRows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{row.product}</td>
                    <td className="px-4 py-3 text-right">{row.qty}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(row.revenue)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatCurrency(row.profit)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
        <div className="mt-4 flex justify-between border-t pt-4 font-semibold">
          <span>Total Profit</span>
          <span className="text-brand-600">{formatCurrency(todayGrossProfit)}</span>
        </div>
      </Modal>

      <Modal open={activeModal === "inventory"} onClose={() => setActiveModal(null)} title="Inventory Value" xl>
        <TableScroll className="rounded-xl border border-slate-200 bg-white" maxHeight="max-h-[50vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventoryValueRows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{row.category}</td>
                  <td className="px-4 py-3 font-medium">{row.product}</td>
                  <td className="px-4 py-3 text-right">{row.stock} {row.unit}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        <div className="mt-4 flex justify-between border-t pt-4 font-semibold">
          <span>Total Inventory Value</span>
          <span className="text-slate-900">{formatCurrency(totalInventoryValue)}</span>
        </div>
      </Modal>

      <Modal open={activeModal === "deliveries"} onClose={() => setActiveModal(null)} title="Pending Deliveries" wide>
        <div className="space-y-3">
          {pendingPOs.length === 0 ? (
            <p className="py-8 text-center text-slate-500">No pending deliveries</p>
          ) : (
            pendingPOs.map((po) => (
              <div key={po.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                <div>
                  <p className="font-semibold text-navy-900">{po.poNumber}</p>
                  <p className="text-xs text-slate-500">
                    Expected: {po.expectedDeliveryDate} · {po.items.length} items
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={statusBadgeClass(po.status)}>{po.status}</span>
                  <Link
                    to={`/deliveries/${po.id}`}
                    className="text-sm font-medium text-gold-600 hover:underline"
                    onClick={() => setActiveModal(null)}
                  >
                    Receive →
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 text-right">
          <Link to="/deliveries" className="btn-primary text-sm" onClick={() => setActiveModal(null)}>
            All Deliveries
          </Link>
        </div>
      </Modal>
    </div>
  );
}
