import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, onSnapshot, orderBy, where } from "firebase/firestore";
import { Receipt, Package, Wallet, TrendingUp, PhilippinePeso } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Sale, SaleVoidRequest, Product, Category } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import DateRangeBar, { EMPTY_RANGE, isWithinRange, rangeLabel, type DateRange } from "@/components/DateRangeBar";
import { StatTile, InDemandTile, TopRankedTile } from "@/components/AnalyticsTiles";
import { formatCurrency, formatDate, statusBadgeClass } from "@/lib/format";
import { canApproveVoidSale, canRequestVoidSale, canViewProfit, canViewSupplierCost, isManagerOrAbove } from "@/lib/permissions";
import { computeSalesAnalytics, type ProductCostInfo } from "@/lib/salesAnalytics";
import { api } from "@/lib/api";
import { callableErrorMessage } from "@/lib/callableError";
import { branchScopedQuery } from "@/lib/branchScope";

type SalesFilter = "active" | "void_pending" | "voided" | "all";

function saleStatusLabel(sale: Sale): string {
  if (sale.status === "VOIDED") return "VOIDED";
  if (sale.pendingVoidRequestId) return "VOID PENDING";
  return sale.status;
}

export default function Sales() {
  const { storeId, user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [voidRequests, setVoidRequests] = useState<SaleVoidRequest[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SalesFilter>("active");
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const [productMap, setProductMap] = useState<Map<string, ProductCostInfo>>(new Map());
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    Promise.all([
      getDocs(collection(db, "stores", storeId, "products")),
      getDocs(collection(db, "stores", storeId, "categories")),
    ]).then(([prodSnap, catSnap]) => {
      const pMap = new Map<string, ProductCostInfo>();
      prodSnap.docs.forEach((d) => {
        const p = d.data() as Product;
        pMap.set(d.id, { name: p.name, supplierCost: p.supplierCost, categoryId: p.categoryId });
      });
      setProductMap(pMap);
      const cMap = new Map<string, string>();
      catSnap.docs.forEach((d) => cMap.set(d.id, (d.data() as Category).name));
      setCategoryNames(cMap);
    });
  }, [storeId]);

  useEffect(() => {
    if (!storeId || !user) return;

    const unsubs = [
      onSnapshot(
        branchScopedQuery(collection(db, "stores", storeId, "sales"), user, orderBy("createdAt", "desc")),
        (snap) => {
          setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sale));
          setLoading(false);
        },
      ),
    ];

    if (canApproveVoidSale(user)) {
      unsubs.push(
        onSnapshot(
          branchScopedQuery(
            collection(db, "stores", storeId, "saleVoidRequests"),
            user,
            where("status", "==", "PENDING"),
            orderBy("requestedAt", "desc"),
          ),
          (snap) => setVoidRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SaleVoidRequest)),
        ),
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [storeId, user]);

  const voidRequestBySaleId = useMemo(() => {
    const map = new Map<string, SaleVoidRequest>();
    voidRequests.forEach((r) => map.set(r.saleId, r));
    return map;
  }, [voidRequests]);

  const salesInRange = useMemo(
    () => sales.filter((s) => isWithinRange(s.createdAt, range)),
    [sales, range],
  );

  const analytics = useMemo(
    () => computeSalesAnalytics(salesInRange, productMap, categoryNames),
    [salesInRange, productMap, categoryNames],
  );

  const filteredSales = useMemo(() => {
    return salesInRange.filter((sale) => {
      if (filter === "active") return sale.status === "COMPLETED" && !sale.pendingVoidRequestId;
      if (filter === "void_pending") return sale.status === "COMPLETED" && !!sale.pendingVoidRequestId;
      if (filter === "voided") return sale.status === "VOIDED";
      return true;
    });
  }, [salesInRange, filter]);

  const openVoidModal = (sale: Sale) => {
    setSelected(sale);
    setVoidReason("");
    setVoidError(null);
    setVoidModalOpen(true);
  };

  const handleVoidSubmit = async () => {
    if (!selected) return;
    setVoidSubmitting(true);
    setVoidError(null);
    try {
      const result = await api.voidSale({ saleId: selected.id, reason: voidReason.trim() });
      const data = result.data as { status?: string; alreadyVoided?: boolean };
      setVoidModalOpen(false);
      setSelected(null);
      if (data.alreadyVoided) {
        return;
      }
      if (data.status === "PENDING") {
        alert("Void request submitted. Waiting for admin or manager approval.");
      }
    } catch (err) {
      setVoidError(callableErrorMessage(err, "Failed to void sale"));
    } finally {
      setVoidSubmitting(false);
    }
  };

  const handleApproveVoid = async (request: SaleVoidRequest) => {
    if (!confirm(`Approve void for receipt #${request.saleId.slice(-8).toUpperCase()}? Stock will be restored.`)) return;
    try {
      await api.approveSaleVoid({ voidRequestId: request.id });
    } catch (err) {
      alert(callableErrorMessage(err, "Failed to approve void"));
    }
  };

  const handleRejectVoid = async (request: SaleVoidRequest) => {
    const reviewNote = prompt("Optional note for rejection:");
    if (reviewNote === null) return;
    try {
      await api.rejectSaleVoid({ voidRequestId: request.id, reviewNote: reviewNote || undefined });
    } catch (err) {
      alert(callableErrorMessage(err, "Failed to reject void"));
    }
  };

  if (loading) return <LoadingSpinner />;

  const manager = user && isManagerOrAbove(user);

  const showCapital = !!user && canViewSupplierCost(user);
  const showProfit = !!user && canViewProfit(user);

  return (
    <div>
      <PageHeader title="Sales" description="View and manage sales transactions" />

      <div className="card mb-4 animate-slide-up">
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="section-heading">Performance</h2>
            <p className="text-xs text-slate-500">Showing {rangeLabel(range)}</p>
          </div>
          <DateRangeBar value={range} onChange={setRange} className="sm:items-end" />
        </div>

        <div className="stagger-children grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={PhilippinePeso} tint="bg-emerald-100 text-emerald-600" label="Revenue" value={formatCurrency(analytics.revenue)} />
          {showProfit ? (
            <StatTile icon={TrendingUp} tint="bg-amber-100 text-amber-600" label="Gross profit" value={formatCurrency(analytics.profit)} />
          ) : (
            <StatTile icon={Receipt} tint="bg-sky-100 text-sky-600" label="Transactions" value={String(analytics.transactions)} />
          )}
          {showCapital ? (
            <StatTile icon={Wallet} tint="bg-violet-100 text-violet-600" label="Capital (COGS)" value={formatCurrency(analytics.capital)} />
          ) : (
            <StatTile icon={Package} tint="bg-violet-100 text-violet-600" label="Items sold" value={String(analytics.itemsSold)} />
          )}
          <StatTile icon={Receipt} tint="bg-sky-100 text-sky-600" label="Transactions" value={String(analytics.transactions)} sub={`${analytics.itemsSold} items sold`} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TopRankedTile label="Top 3 in-demand products" items={analytics.productRanking} />
          <InDemandTile label="In-demand category" item={analytics.topCategory} />
        </div>
      </div>

      {user && canApproveVoidSale(user) && voidRequests.length > 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50/50">
          <h2 className="section-heading mb-3">Pending void approvals ({voidRequests.length})</h2>
          <ul className="space-y-3">
            {voidRequests.map((request) => {
              const sale = sales.find((s) => s.id === request.saleId);
              return (
                <li key={request.id} className="rounded-lg border border-amber-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-slate-900">
                        #{request.saleId.slice(-8).toUpperCase()}
                        {sale && <span className="ml-2 font-sans text-slate-600">{formatCurrency(sale.total)}</span>}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Requested by {request.requestedByName} · {formatDate(request.requestedAt)}
                      </p>
                      <p className="mt-2 text-sm">
                        <span className="font-medium text-slate-700">Reason:</span> {request.reason}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => handleApproveVoid(request)} className="btn-primary text-sm">
                        Approve
                      </button>
                      <button type="button" onClick={() => handleRejectVoid(request)} className="btn-secondary text-sm">
                        Reject
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="filter-bar mb-4">
        <div className="filter-bar-scroll">
        {(
          [
            ["active", "Active sales"],
            ["void_pending", "Void pending"],
            ["voided", "Voided"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              filter === value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
        </div>
      </div>

      <DataTable
        data={filteredSales}
        keyField="id"
        columns={[
          { key: "id", header: "Receipt", sortValue: (s) => s.createdAt, render: (s) => `#${s.id.slice(-8).toUpperCase()}` },
          { key: "cashier", header: "Cashier", sortValue: (s) => s.cashierName, render: (s) => s.cashierName },
          { key: "items", header: "Items", sortValue: (s) => s.items.length, render: (s) => s.items.length },
          { key: "total", header: "Total", sortValue: (s) => s.total, render: (s) => formatCurrency(s.total) },
          { key: "payment", header: "Payment", sortValue: (s) => s.paymentMethod, render: (s) => s.paymentMethod },
          {
            key: "status",
            header: "Status",
            sortValue: (s) => saleStatusLabel(s),
            render: (s) => <span className={statusBadgeClass(saleStatusLabel(s))}>{saleStatusLabel(s)}</span>,
          },
          { key: "date", header: "Date", sortValue: (s) => s.createdAt, render: (s) => formatDate(s.createdAt) },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (s) => (
              <button onClick={() => setSelected(s)} className="text-brand-600 text-sm hover:underline">
                View
              </button>
            ),
          },
        ]}
      />

      <Modal open={!!selected && !voidModalOpen} onClose={() => setSelected(null)} title="Receipt Details">
        {selected && (
          <div className="space-y-4">
            <div className="text-sm text-slate-500">
              {formatDate(selected.createdAt)} · {selected.cashierName}
            </div>
            <div>
              <span className={statusBadgeClass(saleStatusLabel(selected))}>{saleStatusLabel(selected)}</span>
            </div>
            {selected.status === "VOIDED" && selected.voidReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <span className="font-medium">Void reason:</span> {selected.voidReason}
              </div>
            )}
            {selected.pendingVoidRequestId && voidRequestBySaleId.get(selected.id) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="font-medium">Pending void reason:</span>{" "}
                {voidRequestBySaleId.get(selected.id)?.reason}
              </div>
            )}
            <ul className="divide-y divide-slate-100">
              {selected.items.map((item, i) => (
                <li key={i} className="flex justify-between py-2 text-sm">
                  <span>
                    {item.productName} x{item.quantity}
                  </span>
                  <span>{formatCurrency(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t pt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(selected.subtotal)}</span>
              </div>
              {selected.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Promo discount</span>
                  <span>-{formatCurrency(selected.discount)}</span>
                </div>
              )}
              {(selected.pwdSeniorDiscountAmount ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>PWD / Senior (20%)</span>
                  <span>-{formatCurrency(selected.pwdSeniorDiscountAmount!)}</span>
                </div>
              )}
              {selected.tax > 0 && (
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>{formatCurrency(selected.tax)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatCurrency(selected.total)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Payment</span>
                <span>{selected.paymentMethod}</span>
              </div>
            </div>
            {user &&
              canRequestVoidSale(user) &&
              selected.status === "COMPLETED" &&
              !selected.pendingVoidRequestId && (
                <button onClick={() => openVoidModal(selected)} className="btn-danger w-full">
                  {manager ? "Void Sale" : "Request Void"}
                </button>
              )}
            {user && canApproveVoidSale(user) && selected.pendingVoidRequestId && voidRequestBySaleId.get(selected.id) && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleApproveVoid(voidRequestBySaleId.get(selected.id)!)}
                  className="btn-primary flex-1"
                >
                  Approve Void
                </button>
                <button
                  onClick={() => handleRejectVoid(voidRequestBySaleId.get(selected.id)!)}
                  className="btn-secondary flex-1"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={voidModalOpen} onClose={() => setVoidModalOpen(false)} title={manager ? "Void Sale" : "Request Void"}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {manager
              ? "This will void the sale immediately and restore stock to inventory."
              : "Your void request will be sent to an admin or branch manager for approval."}
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium">Reason for void *</label>
            <textarea
              className="input-field min-h-[96px]"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Wrong item scanned, customer cancelled, duplicate transaction..."
              required
            />
          </div>
          {voidError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{voidError}</div>
          )}
          <div className="form-actions">
            <button type="button" onClick={() => setVoidModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleVoidSubmit}
              disabled={voidSubmitting || voidReason.trim().length < 3}
              className="btn-danger"
            >
              {voidSubmitting ? "Submitting..." : manager ? "Void Sale" : "Submit Request"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
