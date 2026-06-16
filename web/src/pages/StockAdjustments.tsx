import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, onSnapshot, getDoc, doc } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BranchInventory, Product, StockAdjustment } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import BranchFilter from "@/components/BranchFilter";
import IntegerInput from "@/components/IntegerInput";
import AdjustmentProgress from "@/components/AdjustmentProgress";
import { api } from "@/lib/api";
import { parseSignedInteger } from "@/lib/integerInput";
import { branchScopedQuery, isStoreWideAccess } from "@/lib/branchScope";
import { statusBadgeClass, formatDate } from "@/lib/format";
import { formatProductLabel } from "@/lib/productUnits";
import { branchName, useBranches } from "@/lib/useBranches";
import { canApproveAdjustment, canRequestStockAdjustment } from "@/lib/permissions";
import {
  PackagePlus,
  ArrowDownUp,
  CheckCircle2,
  XCircle,
  Clock3,
  CheckCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type StatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED";

function adjustmentSearchText(a: StockAdjustment, branchLabel: string): string {
  return [
    a.productName,
    a.reason,
    a.remarks,
    branchLabel,
    a.requestedByName,
    a.reviewedByName,
    a.status,
    a.quantityChange > 0 ? `+${a.quantityChange}` : String(a.quantityChange),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function StockAdjustments() {
  const { storeId, user } = useAuth();
  const { branches } = useBranches(storeId);
  const navigate = useNavigate();
  const location = useLocation();

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [inventory, setInventory] = useState<(BranchInventory & { product?: Product })[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [branchFilter, setBranchFilter] = useState("");
  const [search, setSearch] = useState("");

  // Cards start collapsed by default (compact header + status); expand on click.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isCardCollapsed = (id: string) => collapsed[id] ?? true;
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ productId: "", quantityChange: "", reason: "", remarks: "" });
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const storeWide = user ? isStoreWideAccess(user) : false;
  const canApprove = user ? canApproveAdjustment(user) : false;
  const canRequest = user ? canRequestStockAdjustment(user) : false;
  const effectiveBranchId = user && !storeWide ? user.branchId : branchFilter;

  useEffect(() => {
    if (location.state && (location.state as { openCreate?: boolean }).openCreate) {
      setModalOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  useEffect(() => {
    if (!storeId || !user) return;
    const u1 = onSnapshot(branchScopedQuery(collection(db, "stores", storeId, "stockAdjustments"), user), (snap) => {
      setAdjustments(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StockAdjustment));
      setLoading(false);
    });
    const u2 = onSnapshot(
      branchScopedQuery(collection(db, "stores", storeId, "branchInventory"), user),
      async (snap) => {
        const inv = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BranchInventory);
        const productsSnap = await Promise.all(
          inv.map((i) => getDoc(doc(db, "stores", storeId, "products", i.productId))),
        );
        setInventory(
          inv.map((i, idx) => ({
            ...i,
            product: productsSnap[idx].exists()
              ? ({ id: productsSnap[idx].id, ...productsSnap[idx].data() } as Product)
              : undefined,
          })),
        );
      },
    );
    return () => {
      u1();
      u2();
    };
  }, [storeId, user]);

  const adjustmentBranchId = effectiveBranchId || user?.branchId || "";
  const modalProducts = inventory.filter((i) => !adjustmentBranchId || i.branchId === adjustmentBranchId);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return adjustments
      .filter((a) => {
        if (effectiveBranchId && a.branchId !== effectiveBranchId) return false;
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        if (q && !adjustmentSearchText(a, branchName(branches, a.branchId)).includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [adjustments, effectiveBranchId, statusFilter, search, branches]);

  const counts = useMemo(() => {
    const scoped = adjustments.filter((a) => !effectiveBranchId || a.branchId === effectiveBranchId);
    return {
      pending: scoped.filter((a) => a.status === "PENDING").length,
      approved: scoped.filter((a) => a.status === "APPROVED").length,
      rejected: scoped.filter((a) => a.status === "REJECTED").length,
    };
  }, [adjustments, effectiveBranchId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !adjustmentBranchId) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createStockAdjustment({
        branchId: adjustmentBranchId,
        productId: form.productId,
        quantityChange: parseSignedInteger(form.quantityChange, 0),
        reason: form.reason,
        remarks: form.remarks || undefined,
      });
      setForm({ productId: "", quantityChange: "", reason: "", remarks: "" });
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit adjustment");
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (id: string) => {
    setBusy(`a-${id}`);
    try {
      await api.approveStockAdjustment({ adjustmentId: id });
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string) => {
    const note = window.prompt("Reason for rejecting this adjustment (optional):") ?? undefined;
    setBusy(`r-${id}`);
    try {
      await api.rejectStockAdjustment({ adjustmentId: id, note });
    } finally {
      setBusy(null);
    }
  };

  if (loading || !user) return <LoadingSpinner />;

  const createLabel = canApprove ? "New adjustment" : "Request adjustment";

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        description={
          canApprove
            ? "Correct on-hand counts and review requests from your branches. Approved adjustments update stock instantly and are logged for audit."
            : "Request a correction to your branch stock. An admin reviews each request before it changes the count."
        }
        actions={
          canRequest && (
            <button onClick={() => setModalOpen(true)} className="btn-primary" disabled={!adjustmentBranchId}>
              <PackagePlus size={16} className="mr-1.5" />
              {createLabel}
            </button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard icon={<Clock3 size={18} />} label="Pending" value={counts.pending} tone="amber" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Approved" value={counts.approved} tone="emerald" />
        <StatCard icon={<XCircle size={18} />} label="Rejected" value={counts.rejected} tone="red" />
      </div>

      <div className="filter-bar">
        <div className="filter-bar-scroll w-full sm:w-auto">
          {(["all", "PENDING", "APPROVED", "REJECTED"] as const).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)} className={statusFilter === f ? "btn-primary" : "btn-secondary"}>
              {f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <BranchFilter branches={branches} user={user} value={branchFilter} onChange={setBranchFilter} className="w-full sm:max-w-xs" />
        <input
          className="input-field w-full sm:ml-auto sm:w-72"
          placeholder="Search product, reason, person..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {sorted.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center text-slate-400">
          <ArrowDownUp size={28} />
          <p className="text-sm">No stock adjustments match your filters.</p>
        </div>
      ) : (
        <div className="scroll-area max-h-[calc(100dvh-22rem)] space-y-3 pr-1">
          {sorted.map((a, idx) => {
            const isCollapsed = isCardCollapsed(a.id);
            return (
            <div
              key={a.id}
              className="card animate-slide-up p-4"
              style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleCollapse(a.id)}
                  aria-expanded={!isCollapsed}
                  className="flex min-w-0 items-start gap-2 text-left"
                >
                  <span className="mt-0.5 shrink-0 text-slate-400">
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-900">{a.productName}</span>
                      <span className={`text-base font-bold ${a.quantityChange < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {a.quantityChange > 0 ? "+" : ""}
                        {a.quantityChange}
                      </span>
                      <span className={statusBadgeClass(a.status)}>{a.status}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {a.reason}
                      {storeWide ? ` · ${branchName(branches, a.branchId)}` : ""}
                      {a.requestedByName ? ` · by ${a.requestedByName}` : ""}
                      {` · ${formatDate(a.createdAt)}`}
                    </span>
                    {a.remarks && !isCollapsed && (
                      <span className="mt-1 block text-xs italic text-slate-400">“{a.remarks}”</span>
                    )}
                  </span>
                </button>

                {canApprove && a.status === "PENDING" && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => approve(a.id)}
                      disabled={busy === `a-${a.id}`}
                      className="btn-primary px-3 py-1.5 text-sm"
                    >
                      <CheckCircle size={14} className="mr-1" />
                      Approve
                    </button>
                    <button
                      onClick={() => reject(a.id)}
                      disabled={busy === `r-${a.id}`}
                      className="btn-secondary px-3 py-1.5 text-sm text-red-600"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {!isCollapsed && (
                <>
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                    <AdjustmentProgress status={a.status} />
                  </div>

                  {a.status !== "PENDING" && (a.reviewedByName || a.reviewNote) && (
                    <p className="mt-2 text-xs text-slate-500">
                      {a.status === "APPROVED" ? "Approved" : "Rejected"}
                      {a.reviewedByName ? ` by ${a.reviewedByName}` : ""}
                      {a.resolvedAt ? ` · ${formatDate(a.resolvedAt)}` : ""}
                      {a.reviewNote ? ` — ${a.reviewNote}` : ""}
                    </p>
                  )}
                </>
              )}
            </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={createLabel}>
        <form onSubmit={handleCreate} className="space-y-4">
          {storeWide && (
            <p className="text-sm text-slate-500">
              Branch: <strong>{branchName(branches, adjustmentBranchId)}</strong>
              {!branchFilter && " — select a branch in the filter above first"}
            </p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Product</label>
            <select
              className="input-field"
              required
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">Select...</option>
              {modalProducts.map((i) => (
                <option key={i.id} value={i.productId}>
                  {i.product ? formatProductLabel(i.product) : i.productId}
                  {storeWide ? ` (${branchName(branches, i.branchId)})` : ` · on hand: ${i.currentStock}`}
                </option>
              ))}
            </select>
          </div>
          <IntegerInput
            label="Quantity Change (+/-)"
            value={form.quantityChange}
            onChange={(quantityChange) => setForm({ ...form, quantityChange })}
            placeholder="e.g. 10 or -5"
            allowNegative
            required
          />
          <div>
            <label className="mb-1 block text-sm font-medium">Reason</label>
            <input
              className="input-field"
              required
              placeholder="e.g. Recount, damaged, found extra"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Remarks (optional)</label>
            <input
              className="input-field"
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </div>
          {canApprove && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              As an approver, this adjustment is applied to stock immediately.
            </p>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!adjustmentBranchId || submitting}>
              {submitting ? "Submitting..." : canApprove ? "Apply adjustment" : "Submit request"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "amber" | "emerald" | "red";
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
  } as const;
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 ${tones[tone]}`}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-none tabular-nums sm:text-2xl">{value}</p>
        <p className="mt-1 text-[11px] font-medium sm:text-xs">{label}</p>
      </div>
    </div>
  );
}
