import { useEffect, useState } from "react";
import { collection, getDocs, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Sale, Disposal, Product, BranchInventory, Store } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import TableScroll from "@/components/TableScroll";
import { formatCurrency } from "@/lib/format";
import { Navigate } from "react-router-dom";

type ReportType = "sales" | "products" | "critical" | "disposal" | "profit" | "inventory";

export default function Analytics() {
  const { isPlatformOwner, analyticsStoreId, setAnalyticsStoreId } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [report, setReport] = useState<ReportType>("sales");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPlatformOwner) return;
    return onSnapshot(collection(db, "stores"), (snap) => {
      setStores(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Store));
    });
  }, [isPlatformOwner]);

  useEffect(() => {
    if (!isPlatformOwner || !analyticsStoreId) return;
    setLoading(true);
    const load = async () => {
      const result: Record<string, unknown> = {};
      if (report === "sales" || report === "products" || report === "profit") {
        const snap = await getDocs(query(collection(db, "stores", analyticsStoreId, "sales"), orderBy("createdAt", "desc")));
        const sales = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sale));
        result.sales = sales;
        result.totalRevenue = sales.filter((s) => s.status === "COMPLETED").reduce((a, s) => a + s.total, 0);
        if (report === "products") {
          const map = new Map<string, { name: string; qty: number; revenue: number }>();
          sales.forEach((s) =>
            s.items.forEach((i) => {
              const e = map.get(i.productId) ?? { name: i.productName, qty: 0, revenue: 0 };
              e.qty += i.quantity;
              e.revenue += i.lineTotal;
              map.set(i.productId, e);
            })
          );
          result.productSales = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
        }
        if (report === "profit") {
          const productsSnap = await getDocs(collection(db, "stores", analyticsStoreId, "products"));
          const costs = new Map(productsSnap.docs.map((d) => [d.id, (d.data() as Product).supplierCost ?? 0]));
          let profit = 0;
          sales
            .filter((s) => s.status === "COMPLETED")
            .forEach((s) =>
              s.items.forEach((i) => {
                profit += i.lineTotal - (costs.get(i.productId) ?? 0) * i.quantity;
              })
            );
          result.profit = profit;
        }
      }
      if (report === "critical" || report === "inventory") {
        const invSnap = await getDocs(collection(db, "stores", analyticsStoreId, "branchInventory"));
        const inv = invSnap.docs.map((d) => d.data() as BranchInventory);
        if (report === "critical") result.critical = inv.filter((i) => i.currentStock <= i.criticalLevel);
        if (report === "inventory") {
          const productsSnap = await getDocs(collection(db, "stores", analyticsStoreId, "products"));
          const prices = new Map(productsSnap.docs.map((d) => [d.id, (d.data() as Product).sellingPrice]));
          result.inventoryValue = inv.reduce((a, i) => a + i.currentStock * (prices.get(i.productId) ?? 0), 0);
        }
      }
      if (report === "disposal") {
        const snap = await getDocs(query(collection(db, "stores", analyticsStoreId, "disposals"), orderBy("createdAt", "desc")));
        result.disposals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      setData(result);
      setLoading(false);
    };
    load();
  }, [isPlatformOwner, analyticsStoreId, report]);

  if (!isPlatformOwner) return <Navigate to="/" replace />;

  const reports: { id: ReportType; label: string }[] = [
    { id: "sales", label: "Sales" },
    { id: "products", label: "Product Sales" },
    { id: "critical", label: "Critical Stock" },
    { id: "disposal", label: "Disposals" },
    { id: "inventory", label: "Inventory Value" },
    { id: "profit", label: "Profit" },
  ];

  return (
    <div>
      <PageHeader title="Analytics" />
      <p className="mb-4 text-sm text-slate-500">Read-only overview per store. You cannot change inventory, prices, or stock.</p>

      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium">Store</label>
        <select
          className="input-field max-w-md"
          value={analyticsStoreId ?? ""}
          onChange={(e) => setAnalyticsStoreId(e.target.value || null)}
        >
          <option value="">Select a store...</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {!analyticsStoreId ? (
        <div className="rounded-xl bg-white p-12 text-center text-slate-500 shadow-sm">
          Select a store to view analytics.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setReport(r.id)}
                className={report === r.id ? "btn-primary" : "btn-secondary"}
              >
                {r.label}
              </button>
            ))}
          </div>
          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="card">
              {report === "sales" && (
                <div>
                  <h3 className="mb-2 text-lg font-semibold">Sales Summary</h3>
                  <p className="text-3xl font-bold text-brand-600">{formatCurrency((data.totalRevenue as number) ?? 0)}</p>
                  <p className="mt-1 text-sm text-slate-500">{(data.sales as Sale[])?.length ?? 0} transactions</p>
                </div>
              )}
              {report === "profit" && (
                <div>
                  <h3 className="mb-2 text-lg font-semibold">Total Profit</h3>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency((data.profit as number) ?? 0)}</p>
                </div>
              )}
              {report === "inventory" && (
                <div>
                  <h3 className="mb-2 text-lg font-semibold">Inventory Value</h3>
                  <p className="text-3xl font-bold">{formatCurrency((data.inventoryValue as number) ?? 0)}</p>
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
                  {((data.critical as BranchInventory[]) ?? []).map((i) => (
                    <li key={i.productId} className="flex justify-between text-sm">
                      <span>{i.productId}</span>
                      <span className="text-red-600">
                        {i.currentStock} / {i.criticalLevel}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {report === "disposal" && (
                <ul className="space-y-2">
                  {((data.disposals as Disposal[]) ?? []).map((d) => (
                    <li key={d.id} className="flex justify-between text-sm">
                      <span>
                        {d.productName} · {d.reason}
                      </span>
                      <span>-{d.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
