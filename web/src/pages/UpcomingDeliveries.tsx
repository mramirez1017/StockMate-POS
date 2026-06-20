import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, where, orderBy } from "firebase/firestore";
import { Link } from "react-router-dom";
import { ArrowRight, Truck } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { PurchaseOrder, StockTransfer, Supplier } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import { statusBadgeClass, formatDate } from "@/lib/format";
import { branchScopedQuery, isStoreWideAccess } from "@/lib/branchScope";
import { branchName, useBranches } from "@/lib/useBranches";

export default function UpcomingDeliveries() {
  const { storeId, user } = useAuth();
  const { branches } = useBranches(storeId);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [filter, setFilter] = useState<"today" | "upcoming" | "all">("upcoming");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId || !user) return;
    const u1 = onSnapshot(
      branchScopedQuery(
        collection(db, "stores", storeId, "purchaseOrders"),
        user,
        where("status", "in", ["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"]),
        orderBy("expectedDeliveryDate")
      ),
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseOrder));
        setLoading(false);
      }
    );
    const u2 = onSnapshot(collection(db, "stores", storeId, "suppliers"), (s) =>
      setSuppliers(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier))
    );
    // In-transit branch transfers — surfaced here as "incoming" for the receiving branch.
    const u3 = onSnapshot(
      collection(db, "stores", storeId, "stockTransfers"),
      (snap) => setTransfers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StockTransfer))
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [storeId, user]);

  const storeWide = user ? isStoreWideAccess(user) : false;

  // Transfers in transit that are arriving at the user's branch (or any branch for store-wide roles).
  const incomingTransfers = useMemo(() => {
    return transfers
      .filter((t) => t.status === "IN_TRANSIT")
      .filter((t) => storeWide || t.toBranchId === user?.branchId)
      .sort((a, b) => (b.dispatchedAt ?? b.updatedAt) - (a.dispatchedAt ?? a.updatedAt));
  }, [transfers, storeWide, user]);

  const today = new Date().toISOString().split("T")[0];
  const filtered = orders.filter((o) => {
    if (filter === "today") return o.expectedDeliveryDate === today;
    if (filter === "upcoming") return o.expectedDeliveryDate >= today;
    return true;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Upcoming Deliveries" description="Monitor and receive incoming deliveries" />

      {incomingTransfers.length > 0 && (
        <div className="card mb-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <Truck size={18} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Branch transfers in transit</h2>
              <p className="text-xs text-slate-500">
                Stock dispatched from another branch — receive it on the Stock Transfers page.
              </p>
            </div>
            <span className="badge badge-blue ml-auto">{incomingTransfers.length}</span>
          </div>
          <div className="space-y-2">
            {incomingTransfers.map((t) => {
              const qty = t.items.reduce((sum, i) => sum + i.quantity, 0);
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <span className="font-mono text-sm font-medium text-slate-700">{t.transferNumber}</span>
                  <span className="flex items-center gap-1.5 text-sm text-slate-600">
                    {branchName(branches, t.fromBranchId)}
                    <ArrowRight size={14} className="text-slate-400" />
                    <span className="font-medium text-slate-800">{branchName(branches, t.toBranchId)}</span>
                  </span>
                  <span className="text-sm text-slate-500">
                    {t.items.length} item{t.items.length === 1 ? "" : "s"} · {qty} pcs
                  </span>
                  {t.dispatchedAt && (
                    <span className="text-xs text-slate-400">Dispatched {formatDate(t.dispatchedAt)}</span>
                  )}
                  <Link to="/transfers" className="btn-primary ml-auto px-3 py-1 text-sm">
                    Receive
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["today", "upcoming", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={filter === f ? "btn-primary" : "btn-secondary"}>
            {f === "today" ? "Today" : f === "upcoming" ? "Upcoming" : "All Pending"}
          </button>
        ))}
      </div>
      <DataTable data={filtered} keyField="id" columns={[
        { key: "po", header: "PO", sortValue: (o) => o.poNumber, render: (o) => o.poNumber },
        { key: "supplier", header: "Supplier", sortValue: (o) => suppliers.find((s) => s.id === o.supplierId)?.name ?? "", render: (o) => suppliers.find((s) => s.id === o.supplierId)?.name ?? "-" },
        { key: "date", header: "Expected", sortValue: (o) => o.expectedDeliveryDate, render: (o) => o.expectedDeliveryDate },
        { key: "items", header: "Items", sortValue: (o) => o.items.length, render: (o) => o.items.length },
        { key: "status", header: "Status", sortValue: (o) => o.status, render: (o) => <span className={statusBadgeClass(o.status)}>{o.status}</span> },
        { key: "actions", header: "", sortable: false, render: (o) => <Link to={`/deliveries/${o.id}`} className="btn-primary text-sm py-1 px-3">Open Checklist</Link> },
      ]} />
    </div>
  );
}
