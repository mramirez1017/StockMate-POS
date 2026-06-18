import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BranchInventory, Product, StockTransfer } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import IntegerInput from "@/components/IntegerInput";
import Pagination from "@/components/Pagination";
import { api } from "@/lib/api";
import { parseInteger } from "@/lib/integerInput";
import { branchScopedQuery, isStoreWideAccess } from "@/lib/branchScope";
import { statusBadgeClass, formatDate } from "@/lib/format";
import { formatProductLabel } from "@/lib/productUnits";
import { branchName, useBranches } from "@/lib/useBranches";
import { isManagerOrAbove, isStoreAdmin } from "@/lib/permissions";
import {
  ArrowLeftRight,
  ArrowRight,
  Plus,
  Trash2,
  PackageCheck,
  Ban,
  Check,
  X,
  Clock3,
  Truck,
  CheckCircle2,
} from "lucide-react";

type StatusFilter = "all" | "PENDING_APPROVAL" | "IN_TRANSIT" | "COMPLETED" | "REJECTED" | "CANCELLED";

interface DraftItem {
  productId: string;
  quantity: string;
}

export default function StockTransfers() {
  const { storeId, user } = useAuth();
  const { branches } = useBranches(storeId);

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invMap, setInvMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const [modalOpen, setModalOpen] = useState(false);
  const [direction, setDirection] = useState<"SEND" | "REQUEST">("SEND");
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [otherBranchId, setOtherBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ productId: "", quantity: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const storeWide = user ? isStoreWideAccess(user) : false;
  const manage = user ? isManagerOrAbove(user) : false;
  const admin = user ? isStoreAdmin(user) : false;

  useEffect(() => {
    if (!storeId || !user) return;
    const u1 = onSnapshot(collection(db, "stores", storeId, "stockTransfers"), (snap) => {
      setTransfers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StockTransfer));
      setLoading(false);
    });
    const u2 = onSnapshot(
      query(collection(db, "stores", storeId, "products"), where("status", "==", "ACTIVE")),
      (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)),
    );
    const u3 = onSnapshot(
      branchScopedQuery(collection(db, "stores", storeId, "branchInventory"), user),
      (snap) => {
        const map: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const inv = d.data() as BranchInventory;
          map[`${inv.branchId}_${inv.productId}`] = inv.currentStock;
        });
        setInvMap(map);
      },
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [storeId, user]);

  // Resolve the source/destination branch from the manager's direction toggle.
  const resolvedFrom = storeWide ? fromBranchId : direction === "SEND" ? user?.branchId ?? "" : otherBranchId;
  const resolvedTo = storeWide ? toBranchId : direction === "SEND" ? otherBranchId : user?.branchId ?? "";

  const visibleTransfers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transfers
      .filter((t) => {
        if (!storeWide && user) {
          if (t.fromBranchId !== user.branchId && t.toBranchId !== user.branchId) return false;
        }
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (q) {
          const text = [
            t.transferNumber,
            branchName(branches, t.fromBranchId),
            branchName(branches, t.toBranchId),
            t.requestedByName,
            t.notes,
            ...t.items.map((i) => i.productName),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [transfers, storeWide, user, statusFilter, search, branches]);

  const pageCount = Math.max(1, Math.ceil(visibleTransfers.length / PAGE_SIZE));
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);
  const pagedTransfers = useMemo(
    () => visibleTransfers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visibleTransfers, page],
  );

  const counts = useMemo(() => {
    const scoped = transfers.filter(
      (t) => storeWide || !user || t.fromBranchId === user.branchId || t.toBranchId === user.branchId,
    );
    return {
      pending: scoped.filter((t) => t.status === "PENDING_APPROVAL").length,
      inTransit: scoped.filter((t) => t.status === "IN_TRANSIT").length,
      completed: scoped.filter((t) => t.status === "COMPLETED").length,
    };
  }, [transfers, storeWide, user]);

  const resetForm = () => {
    setDirection("SEND");
    setFromBranchId("");
    setToBranchId("");
    setOtherBranchId("");
    setNotes("");
    setDraftItems([{ productId: "", quantity: "" }]);
    setError("");
  };

  const openModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const updateDraft = (idx: number, patch: Partial<DraftItem>) =>
    setDraftItems((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  const addDraftRow = () => setDraftItems((prev) => [...prev, { productId: "", quantity: "" }]);
  const removeDraftRow = (idx: number) =>
    setDraftItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedFrom || !resolvedTo) {
      setError("Choose both a source and a destination branch.");
      return;
    }
    if (resolvedFrom === resolvedTo) {
      setError("Source and destination branches must be different.");
      return;
    }
    const items = draftItems
      .filter((d) => d.productId && parseInteger(d.quantity, 0) > 0)
      .map((d) => ({ productId: d.productId, quantity: parseInteger(d.quantity, 0) }));
    if (items.length === 0) {
      setError("Add at least one product with a quantity.");
      return;
    }
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.productId)) {
        setError("Each product can only be added once.");
        return;
      }
      seen.add(it.productId);
    }

    setSubmitting(true);
    setError("");
    try {
      await api.createStockTransfer({
        fromBranchId: resolvedFrom,
        toBranchId: resolvedTo,
        items,
        notes: notes.trim() || undefined,
      });
      setModalOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transfer");
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading || !user) return <LoadingSpinner />;

  const toggleExpand = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div>
      <PageHeader
        title="Stock Transfers"
        description="Move stock between branches. A manager's request needs store-owner approval; once approved (or created by an owner) stock leaves the source, and the destination branch confirms receipt — every step is logged to stock movements."
        actions={
          manage && (
            <button onClick={openModal} className="btn-primary" disabled={branches.length < 2}>
              <ArrowLeftRight size={16} className="mr-1.5" />
              New transfer
            </button>
          )
        }
      />

      {branches.length < 2 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You need at least two active branches to transfer stock.
        </p>
      )}

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard icon={<Clock3 size={18} />} label="Awaiting approval" value={counts.pending} tone="amber" />
        <StatCard icon={<Truck size={18} />} label="In transit" value={counts.inTransit} tone="violet" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Completed" value={counts.completed} tone="emerald" />
      </div>

      <div className="filter-bar">
        <div className="filter-bar-scroll w-full sm:w-auto">
          {(["all", "PENDING_APPROVAL", "IN_TRANSIT", "COMPLETED", "REJECTED", "CANCELLED"] as const).map((f) => {
            const label =
              f === "all"
                ? "All"
                : f === "PENDING_APPROVAL"
                  ? "Awaiting approval"
                  : f.replace("_", " ").charAt(0) + f.replace("_", " ").slice(1).toLowerCase();
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={statusFilter === f ? "btn-primary" : "btn-secondary"}
              >
                {label}
              </button>
            );
          })}
        </div>
        <input
          className="input-field w-full sm:ml-auto sm:w-72"
          placeholder="Search transfer #, branch, product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {visibleTransfers.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center text-slate-400">
          <ArrowLeftRight size={28} />
          <p className="text-sm">No transfers match your filters.</p>
        </div>
      ) : (
        <div className="scroll-area max-h-[calc(100dvh-24rem)] space-y-3 pr-1">
          {pagedTransfers.map((t, idx) => {
            const isOpen = expanded[t.id] ?? false;
            const involvesMyBranch =
              !user.branchId || t.fromBranchId === user.branchId || t.toBranchId === user.branchId;
            const canApprove = t.status === "PENDING_APPROVAL" && admin;
            const canReceive =
              t.status === "IN_TRANSIT" && manage && (storeWide || t.toBranchId === user.branchId);
            const canCancel =
              (t.status === "PENDING_APPROVAL" || t.status === "IN_TRANSIT") &&
              manage &&
              (storeWide || involvesMyBranch);
            const totalUnits = t.items.reduce((s, i) => s + (i.receivedQty ?? i.quantity), 0);

            return (
              <div
                key={t.id}
                className="card animate-slide-up p-4"
                style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" onClick={() => toggleExpand(t.id)} className="min-w-0 text-left">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-900">{t.transferNumber}</span>
                      <span className={statusBadgeClass(t.status)}>{t.status.replace("_", " ")}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                      <span className="font-medium">{branchName(branches, t.fromBranchId)}</span>
                      <ArrowRight size={14} className="text-cyan-500" />
                      <span className="font-medium">{branchName(branches, t.toBranchId)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {t.items.length} item(s) · {totalUnits} unit(s) · {t.requestedByName} · {formatDate(t.createdAt)}
                    </span>
                  </button>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {canApprove && (
                      <>
                        <button
                          onClick={() => runAction(`a-${t.id}`, () => api.approveStockTransfer({ transferId: t.id }))}
                          disabled={busy === `a-${t.id}`}
                          className="btn-primary px-3 py-1.5 text-sm"
                        >
                          <Check size={14} className="mr-1" />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt("Reason for rejecting (optional):") ?? undefined;
                            runAction(`x-${t.id}`, () => api.rejectStockTransfer({ transferId: t.id, reason }));
                          }}
                          disabled={busy === `x-${t.id}`}
                          className="btn-secondary px-3 py-1.5 text-sm text-red-600"
                        >
                          <X size={14} className="mr-1" />
                          Reject
                        </button>
                      </>
                    )}
                    {canReceive && (
                      <button
                        onClick={() => runAction(`r-${t.id}`, () => api.receiveStockTransfer({ transferId: t.id }))}
                        disabled={busy === `r-${t.id}`}
                        className="btn-primary px-3 py-1.5 text-sm"
                      >
                        <PackageCheck size={14} className="mr-1" />
                        Receive
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => {
                          const reason = window.prompt("Reason for cancelling (optional):") ?? undefined;
                          runAction(`c-${t.id}`, () => api.cancelStockTransfer({ transferId: t.id, reason }));
                        }}
                        disabled={busy === `c-${t.id}`}
                        className="btn-secondary px-3 py-1.5 text-sm text-red-600"
                      >
                        <Ban size={14} className="mr-1" />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                    <div className="overflow-hidden rounded-lg border border-slate-100">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Product</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            {t.status === "COMPLETED" && <th className="px-3 py-2 text-right">Received</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {t.items.map((i) => (
                            <tr key={i.productId}>
                              <td className="px-3 py-2 text-slate-800">{i.productName}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
                              {t.status === "COMPLETED" && (
                                <td className="px-3 py-2 text-right tabular-nums">{i.receivedQty ?? i.quantity}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {t.notes && <p className="text-xs italic text-slate-500">“{t.notes}”</p>}
                    <div className="space-y-0.5 text-xs text-slate-500">
                      {t.approvedByName && (
                        <p>Approved / sent by {t.approvedByName}{t.approvedAt ? ` · ${formatDate(t.approvedAt)}` : ""}</p>
                      )}
                      {t.receivedByName && (
                        <p>Received by {t.receivedByName}{t.receivedAt ? ` · ${formatDate(t.receivedAt)}` : ""}</p>
                      )}
                      {t.rejectedByName && (
                        <p className="text-red-500">
                          Rejected by {t.rejectedByName}{t.rejectedAt ? ` · ${formatDate(t.rejectedAt)}` : ""}
                          {t.rejectReason ? ` — ${t.rejectReason}` : ""}
                        </p>
                      )}
                      {t.cancelledByName && (
                        <p className="text-red-500">
                          Cancelled by {t.cancelledByName}{t.cancelledAt ? ` · ${formatDate(t.cancelledAt)}` : ""}
                          {t.cancelReason ? ` — ${t.cancelReason}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <Pagination
            page={page}
            pageCount={pageCount}
            total={visibleTransfers.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="rounded-xl border border-slate-100"
          />
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New stock transfer">
        <form onSubmit={handleCreate} className="space-y-4">
          {storeWide ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <div>
                <label className="mb-1 block text-sm font-medium">From branch</label>
                <select
                  className="input-field"
                  required
                  value={fromBranchId}
                  onChange={(e) => setFromBranchId(e.target.value)}
                >
                  <option value="">Select...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="hidden pb-2.5 text-cyan-500 sm:block">
                <ArrowRight size={18} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">To branch</label>
                <select
                  className="input-field"
                  required
                  value={toBranchId}
                  onChange={(e) => setToBranchId(e.target.value)}
                >
                  <option value="">Select...</option>
                  {branches.filter((b) => b.id !== fromBranchId).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDirection("SEND")}
                  className={direction === "SEND" ? "btn-primary flex-1" : "btn-secondary flex-1"}
                >
                  Send to branch
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("REQUEST")}
                  className={direction === "REQUEST" ? "btn-primary flex-1" : "btn-secondary flex-1"}
                >
                  Request from branch
                </button>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {direction === "SEND" ? "Destination branch" : "Source branch"}
                </label>
                <select
                  className="input-field"
                  required
                  value={otherBranchId}
                  onChange={(e) => setOtherBranchId(e.target.value)}
                >
                  <option value="">Select...</option>
                  {branches.filter((b) => b.id !== user.branchId).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500">
                {branchName(branches, resolvedFrom || "—")} <span className="text-cyan-500">→</span>{" "}
                {branchName(branches, resolvedTo || "—")}
                {" — a store owner approves it before stock is sent out."}
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Items</label>
            <div className="space-y-2">
              {draftItems.map((d, idx) => {
                const onHand = resolvedFrom ? invMap[`${resolvedFrom}_${d.productId}`] : undefined;
                return (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <select
                        className="input-field"
                        value={d.productId}
                        onChange={(e) => updateDraft(idx, { productId: e.target.value })}
                      >
                        <option value="">Select product...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{formatProductLabel(p)}</option>
                        ))}
                      </select>
                      {d.productId && onHand != null && (
                        <p className="mt-0.5 text-[11px] text-slate-400">Source on-hand: {onHand}</p>
                      )}
                    </div>
                    <div className="w-24 shrink-0">
                      <IntegerInput
                        value={d.quantity}
                        onChange={(quantity) => updateDraft(idx, { quantity })}
                        placeholder="Qty"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDraftRow(idx)}
                      className="mt-2 shrink-0 text-slate-400 hover:text-red-500"
                      aria-label="Remove item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addDraftRow} className="btn-secondary mt-2 text-sm">
              <Plus size={14} className="mr-1" />
              Add item
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Notes (optional)</label>
            <input
              className="input-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Restocking for weekend rush"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="form-actions">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Creating..." : "Create transfer"}
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
  tone: "amber" | "violet" | "emerald";
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
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
