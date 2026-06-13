import { useEffect, useState } from "react";
import { collection, onSnapshot, where, orderBy } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { PurchaseOrder, Supplier } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import { statusBadgeClass } from "@/lib/format";
import { branchScopedQuery } from "@/lib/branchScope";

export default function UpcomingDeliveries() {
  const { storeId, user } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
    return () => { u1(); u2(); };
  }, [storeId, user]);

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
      <div className="mb-4 flex gap-2">
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
