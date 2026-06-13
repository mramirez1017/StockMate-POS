import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Sale, Disposal, Product, BranchInventory } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import TableScroll from "@/components/TableScroll";
import { formatCurrency } from "@/lib/format";
import { canViewProfit, canViewSupplierCost } from "@/lib/permissions";

type ReportType = "sales" | "products" | "critical" | "delivery" | "disposal" | "profit" | "inventory";

export default function Reports() {
  const { storeId, user } = useAuth();
  const [report, setReport] = useState<ReportType>("sales");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  const reports: { id: ReportType; label: string; adminOnly?: boolean }[] = [
    { id: "sales", label: "Sales Report" },
    { id: "products", label: "Product Sales" },
    { id: "critical", label: "Critical Stock" },
    { id: "disposal", label: "Disposal / Expired" },
    { id: "inventory", label: "Inventory Value", adminOnly: true },
    { id: "profit", label: "Profit Report", adminOnly: true },
  ];

  const available = reports.filter((r) => !r.adminOnly || (user && canViewProfit(user)));

  useEffect(() => {
    if (!storeId || !user) return;
    setLoading(true);
    const load = async () => {
      const result: Record<string, unknown> = {};
      if (report === "sales" || report === "products" || report === "profit") {
        const snap = await getDocs(query(collection(db, "stores", storeId, "sales"), orderBy("createdAt", "desc")));
        const sales = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sale));
        result.sales = sales;
        result.totalRevenue = sales.filter((s) => s.status === "COMPLETED").reduce((a, s) => a + s.total, 0);
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
        const invSnap = await getDocs(collection(db, "stores", storeId, "branchInventory"));
        const inv = invSnap.docs.map((d) => d.data() as BranchInventory);
        if (report === "critical") result.critical = inv.filter((i) => i.currentStock <= i.criticalLevel);
        if (report === "inventory") {
          const productsSnap = await getDocs(collection(db, "stores", storeId, "products"));
          const productMap = new Map(
            productsSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Product]),
          );
          const branchesSnap = await getDocs(collection(db, "stores", storeId, "branches"));
          const branchNames = new Map(branchesSnap.docs.map((d) => [d.id, (d.data() as { name: string }).name]));

          let capitalCost = 0;
          let totalProfit = 0;
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
          result.inventoryLines = inventoryLines;
        }
      }
      if (report === "disposal") {
        const snap = await getDocs(query(collection(db, "stores", storeId, "disposals"), orderBy("createdAt", "desc")));
        result.disposals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      setData(result);
      setLoading(false);
    };
    load();
  }, [storeId, user, report]);

  if (!user) return null;

  return (
    <div>
      <PageHeader title="Reports" />
      <div className="mb-6 flex flex-wrap gap-2">
        {available.map((r) => (
          <button key={r.id} onClick={() => setReport(r.id)} className={report === r.id ? "btn-primary" : "btn-secondary"}>{r.label}</button>
        ))}
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="card">
          {report === "sales" && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Sales Summary</h3>
              <p className="text-3xl font-bold text-brand-600">{formatCurrency((data.totalRevenue as number) ?? 0)}</p>
              <p className="text-sm text-slate-500 mt-1">{(data.sales as Sale[])?.length ?? 0} transactions</p>
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
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-500">Capital cost (supplier cost × stock)</p>
                  <p className="text-2xl font-bold text-slate-900">{formatCurrency((data.capitalCost as number) ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm text-emerald-700">Potential profit on hand</p>
                  <p className="text-2xl font-bold text-emerald-700">{formatCurrency((data.totalProfit as number) ?? 0)}</p>
                </div>
              </div>
              <TableScroll>
                <table className="w-full text-sm">
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
              {((data.critical as BranchInventory[]) ?? []).map((i) => (
                <li key={i.productId} className="flex justify-between text-sm"><span>{i.productId}</span><span className="text-red-600">{i.currentStock} / {i.criticalLevel}</span></li>
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
        </div>
      )}
    </div>
  );
}
