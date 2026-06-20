import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveBranch } from "@/contexts/ActiveBranchContext";
import { Product, StockCount as StockCountDoc } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import { isStoreWideAccess } from "@/lib/branchScope";
import { statusBadgeClass, formatDate } from "@/lib/format";
import { formatProductLabel } from "@/lib/productUnits";
import { branchName, useBranches } from "@/lib/useBranches";
import { isManagerOrAbove } from "@/lib/permissions";
import {
  ClipboardCheck,
  ClipboardList,
  Search,
  Ban,
  Save,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type StatusFilter = "all" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export default function StockCount() {
  const { storeId, user } = useAuth();
  const { branches } = useBranches(storeId);
  const { activeBranchId } = useActiveBranch();

  const [counts, setCounts] = useState<StockCountDoc[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [startOpen, setStartOpen] = useState(false);
  const [scope, setScope] = useState<"FULL" | "PARTIAL">("FULL");
  const [partialIds, setPartialIds] = useState<string[]>([]);
  const [partialSearch, setPartialSearch] = useState("");
  const [startNotes, setStartNotes] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const [countedDraft, setCountedDraft] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [panelError, setPanelError] = useState("");

  const storeWide = user ? isStoreWideAccess(user) : false;
  const manage = user ? isManagerOrAbove(user) : false;
  const countBranchId = storeWide ? activeBranchId : user?.branchId ?? "";

  useEffect(() => {
    if (!storeId || !user) return;
    const u1 = onSnapshot(collection(db, "stores", storeId, "stockCounts"), (snap) => {
      setCounts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StockCountDoc));
      setLoading(false);
    });
    const u2 = onSnapshot(
      query(collection(db, "stores", storeId, "products"), where("status", "==", "ACTIVE")),
      (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)),
    );
    return () => {
      u1();
      u2();
    };
  }, [storeId, user]);

  const visibleCounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return counts
      .filter((c) => {
        if (!storeWide && user && c.branchId !== user.branchId) return false;
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (q) {
          const text = [c.countNumber, branchName(branches, c.branchId), c.startedByName, c.notes]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [counts, storeWide, user, statusFilter, search, branches]);

  // The active counting session for the currently selected branch.
  const openCount = useMemo(
    () => counts.find((c) => c.status === "IN_PROGRESS" && c.branchId === countBranchId) ?? null,
    [counts, countBranchId],
  );

  const stats = useMemo(() => {
    const scoped = counts.filter((c) => storeWide || !user || c.branchId === user.branchId);
    return {
      inProgress: scoped.filter((c) => c.status === "IN_PROGRESS").length,
      completed: scoped.filter((c) => c.status === "COMPLETED").length,
      varianceUnits: scoped
        .filter((c) => c.status === "COMPLETED")
        .reduce((s, c) => s + (c.totalVarianceUnits ?? 0), 0),
    };
  }, [counts, storeWide, user]);

  const partialMatches = useMemo(() => {
    const q = partialSearch.trim().toLowerCase();
    return products
      .filter((p) => !q || formatProductLabel(p).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [products, partialSearch]);

  const resetStartForm = () => {
    setScope("FULL");
    setPartialIds([]);
    setPartialSearch("");
    setStartNotes("");
    setStartError("");
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!countBranchId) {
      setStartError("Select a branch first (use the branch selector at the top).");
      return;
    }
    if (scope === "PARTIAL" && partialIds.length === 0) {
      setStartError("Pick at least one product for a partial count.");
      return;
    }
    setStarting(true);
    setStartError("");
    try {
      await api.createStockCount({
        branchId: countBranchId,
        scope,
        productIds: scope === "PARTIAL" ? partialIds : undefined,
        notes: startNotes.trim() || undefined,
      });
      setStartOpen(false);
      resetStartForm();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start count");
    } finally {
      setStarting(false);
    }
  };

  const handleSubmitCount = async () => {
    if (!openCount) return;
    const counts_ = openCount.items
      .filter((i) => countedDraft[i.productId] != null && countedDraft[i.productId] !== "")
      .map((i) => ({ productId: i.productId, countedQty: parseInt(countedDraft[i.productId], 10) }))
      .filter((c) => Number.isFinite(c.countedQty) && c.countedQty >= 0);
    if (counts_.length === 0) {
      setPanelError("Enter at least one counted quantity before posting.");
      return;
    }
    setSubmitting(true);
    setPanelError("");
    try {
      await api.submitStockCount({ countId: openCount.id, counts: counts_ });
      setCountedDraft({});
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Failed to post count");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelCount = async () => {
    if (!openCount) return;
    const reason = window.prompt("Reason for cancelling this count (optional):") ?? undefined;
    setBusy("cancel");
    try {
      await api.cancelStockCount({ countId: openCount.id, reason });
      setCountedDraft({});
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setBusy(null);
    }
  };

  if (loading || !user) return <LoadingSpinner />;

  const toggleExpand = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const togglePartial = (id: string) =>
    setPartialIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div>
      <PageHeader
        title="Stock Count"
        description="Run a physical stock-take. Opening a session snapshots expected quantities; posting it reconciles inventory and logs the variance as a stock adjustment."
        actions={
          manage &&
          !openCount && (
            <button onClick={() => { resetStartForm(); setStartOpen(true); }} className="btn-primary" disabled={!countBranchId}>
              <PlayCircle size={16} className="mr-1.5" />
              Start count
            </button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard icon={<ClipboardList size={18} />} label="In progress" value={stats.inProgress} tone="amber" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Completed" value={stats.completed} tone="emerald" />
        <StatCard icon={<AlertTriangle size={18} />} label="Variance units" value={stats.varianceUnits} tone="rose" />
      </div>

      {openCount && (
        <div className="card mb-5 border-indigo-200 bg-indigo-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <ClipboardCheck size={18} className="text-indigo-600" />
                Counting · {openCount.countNumber}
                <span className={statusBadgeClass(openCount.status)}>{openCount.scope}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {branchName(branches, openCount.branchId)} · {openCount.items.length} item(s) · started by{" "}
                {openCount.startedByName} · {formatDate(openCount.startedAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCancelCount} disabled={busy === "cancel"} className="btn-secondary text-red-600">
                <Ban size={14} className="mr-1" />
                Cancel
              </button>
              <button onClick={handleSubmitCount} disabled={submitting} className="btn-primary">
                <Save size={14} className="mr-1" />
                {submitting ? "Posting..." : "Post count"}
              </button>
            </div>
          </div>

          {panelError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{panelError}</p>}

          <div className="mt-3 table-scroll max-h-[calc(100dvh-30rem)] rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Expected</th>
                  <th className="px-3 py-2 text-right">Counted</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openCount.items.map((item) => {
                  const raw = countedDraft[item.productId] ?? "";
                  const counted = raw === "" ? null : parseInt(raw, 10);
                  const variance = counted == null || Number.isNaN(counted) ? null : counted - item.expectedQty;
                  return (
                    <tr key={item.productId}>
                      <td className="px-3 py-2 text-slate-800">{item.productName}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{item.expectedQty}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="input-field w-20 py-1 text-right"
                          placeholder="—"
                          value={raw}
                          onChange={(e) =>
                            setCountedDraft((prev) => ({
                              ...prev,
                              [item.productId]: e.target.value.replace(/[^\d]/g, ""),
                            }))
                          }
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          variance == null ? "text-slate-300" : variance === 0 ? "text-slate-400" : variance > 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {variance == null ? "—" : variance > 0 ? `+${variance}` : variance}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Leave a row blank to skip it (its stock stays unchanged). Variance is recomputed against live on-hand when you post.
          </p>
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-bar-scroll w-full sm:w-auto">
          {(["all", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)} className={statusFilter === f ? "btn-primary" : "btn-secondary"}>
              {f === "all" ? "All" : f.replace("_", " ").charAt(0) + f.replace("_", " ").slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:ml-auto sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field w-full pl-9"
            placeholder="Search count #, branch, person..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {visibleCounts.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center text-slate-400">
          <ClipboardCheck size={28} />
          <p className="text-sm">No stock counts match your filters.</p>
        </div>
      ) : (
        <div className="scroll-area max-h-[calc(100dvh-24rem)] space-y-3 pr-1">
          {visibleCounts.map((c, idx) => {
            const isOpen = expanded[c.id] ?? false;
            return (
              <div key={c.id} className="card animate-slide-up p-4" style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}>
                <button type="button" onClick={() => toggleExpand(c.id)} className="w-full text-left">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-slate-900">{c.countNumber}</span>
                    <span className={statusBadgeClass(c.status)}>{c.status.replace("_", " ")}</span>
                    <span className="badge-blue">{c.scope}</span>
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">{branchName(branches, c.branchId)}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {c.items.length} item(s)
                    {c.status === "COMPLETED" &&
                      ` · ${c.varianceItems ?? 0} with variance · ${c.totalVarianceUnits ?? 0} unit(s)`}{" "}
                    · {c.startedByName} · {formatDate(c.createdAt)}
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                    {c.status === "COMPLETED" && (
                      <div className="overflow-x-auto rounded-lg border border-slate-100">
                        <table className="w-full min-w-[420px] text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Product</th>
                              <th className="px-3 py-2 text-right">Expected</th>
                              <th className="px-3 py-2 text-right">Counted</th>
                              <th className="px-3 py-2 text-right">Variance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {c.items
                              .filter((i) => i.countedQty != null)
                              .map((i) => (
                                <tr key={i.productId}>
                                  <td className="px-3 py-2 text-slate-800">{i.productName}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{i.expectedQty}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{i.countedQty}</td>
                                  <td
                                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                                      (i.variance ?? 0) === 0 ? "text-slate-400" : (i.variance ?? 0) > 0 ? "text-emerald-600" : "text-red-600"
                                    }`}
                                  >
                                    {(i.variance ?? 0) > 0 ? `+${i.variance}` : i.variance ?? 0}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {c.notes && <p className="text-xs italic text-slate-500">“{c.notes}”</p>}
                    <div className="space-y-0.5 text-xs text-slate-500">
                      {c.completedByName && (
                        <p>Completed by {c.completedByName}{c.completedAt ? ` · ${formatDate(c.completedAt)}` : ""}</p>
                      )}
                      {c.cancelledByName && (
                        <p className="text-red-500">
                          Cancelled by {c.cancelledByName}{c.cancelledAt ? ` · ${formatDate(c.cancelledAt)}` : ""}
                          {c.cancelReason ? ` — ${c.cancelReason}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={startOpen} onClose={() => setStartOpen(false)} title="Start stock count">
        <form onSubmit={handleStart} className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Counting branch: <span className="font-semibold text-slate-900">{branchName(branches, countBranchId) || "—"}</span>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setScope("FULL")} className={scope === "FULL" ? "btn-primary flex-1" : "btn-secondary flex-1"}>
              Full count
            </button>
            <button type="button" onClick={() => setScope("PARTIAL")} className={scope === "PARTIAL" ? "btn-primary flex-1" : "btn-secondary flex-1"}>
              Partial (cycle)
            </button>
          </div>

          {scope === "PARTIAL" && (
            <div>
              <label className="mb-1 block text-sm font-medium">
                Products to count {partialIds.length > 0 && <span className="text-slate-400">({partialIds.length} selected)</span>}
              </label>
              <input
                className="input-field mb-2"
                placeholder="Search products..."
                value={partialSearch}
                onChange={(e) => setPartialSearch(e.target.value)}
              />
              <div className="scroll-area max-h-56 space-y-1 rounded-lg border border-slate-200 p-2">
                {partialMatches.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                    <input type="checkbox" checked={partialIds.includes(p.id)} onChange={() => togglePartial(p.id)} className="rounded" />
                    <span className="min-w-0 flex-1 truncate text-sm">{formatProductLabel(p)}</span>
                  </label>
                ))}
                {partialMatches.length === 0 && <p className="px-2 py-3 text-center text-sm text-slate-400">No products found.</p>}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Notes (optional)</label>
            <input className="input-field" value={startNotes} onChange={(e) => setStartNotes(e.target.value)} placeholder="e.g. End-of-month full count" />
          </div>

          {startError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{startError}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => setStartOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={starting}>
              {starting ? "Starting..." : "Start count"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "amber" | "emerald" | "rose" }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
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
