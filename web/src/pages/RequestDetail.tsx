import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, CheckCircle2, Pencil, Plus, ShoppingCart, X, XCircle } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { Branch, PurchaseRequest } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import IntegerInput from "@/components/IntegerInput";
import ProcurementTimeline from "@/components/ProcurementTimeline";
import ThreadPanel from "@/components/ThreadPanel";
import { isStoreAdmin } from "@/lib/permissions";
import { isStoreWideAccess } from "@/lib/branchScope";
import { api } from "@/lib/api";
import { callableErrorMessage } from "@/lib/callableError";
import { formatDate, statusBadgeClass } from "@/lib/format";
import { parseInteger } from "@/lib/integerInput";
import { requestMeta, requestTitle } from "@/lib/purchaseRequests";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  );
}

export default function RequestDetail() {
  const { requestId } = useParams<{ requestId: string }>();
  const { storeId, user } = useAuth();
  const navigate = useNavigate();

  const [request, setRequest] = useState<PurchaseRequest | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId || !requestId) return;
    const unsub = onSnapshot(
      doc(db, "stores", storeId, "purchaseRequests", requestId),
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
          setRequest(null);
        } else {
          setRequest({ id: snap.id, ...snap.data() } as PurchaseRequest);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [storeId, requestId]);

  useEffect(() => {
    if (!storeId || !request?.branchId) return;
    const unsub = onSnapshot(doc(db, "stores", storeId, "branches", request.branchId), (snap) =>
      setBranch(snap.exists() ? ({ id: snap.id, ...snap.data() } as Branch) : null),
    );
    return () => unsub();
  }, [storeId, request?.branchId]);

  const beginEdit = () => {
    if (!request) return;
    setQty(request.suggestedQty ? String(request.suggestedQty) : "");
    setSubject(request.subject ?? "");
    setDescription(request.description ?? request.notes ?? "");
    setError(null);
    setEditing(true);
  };

  if (loading) return <LoadingSpinner />;

  const outOfBranch =
    !!request && !!user && !isStoreWideAccess(user) && request.branchId !== user.branchId;

  if (notFound || !request || !user || outOfBranch) {
    return (
      <div>
        <PageHeader title={outOfBranch ? "Request unavailable" : "Request not found"} />
        {outOfBranch && (
          <p className="mb-3 text-sm text-slate-600">This request belongs to another branch.</p>
        )}
        <button onClick={() => navigate("/activity")} className="btn-secondary">
          <ArrowLeft size={16} /> Back to Activity
        </button>
      </div>
    );
  }

  const meta = requestMeta(request);
  const type = request.requestType ?? "PRODUCT_REORDER";
  const isReorder = type === "PRODUCT_REORDER";
  const isAdmin = isStoreAdmin(user);
  const isOwner = request.requestedBy === user.id;
  const isOpen = request.status === "PENDING";
  const isRejected = request.status === "REJECTED";
  const canEdit = (isOwner || isAdmin) && (isOpen || isRejected);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(callableErrorMessage(err, "Action failed"));
    } finally {
      setBusy(null);
    }
  };

  const goFulfill = () => {
    const path = meta.createPath;
    if (!path) return;
    navigate(path, {
      state: { openCreate: true, prefillName: request.subject, fulfillRequestId: request.id },
    });
  };

  const createPoFromRequest = () => {
    navigate("/purchase-orders", {
      state: {
        prefill: {
          branchId: request.branchId,
          requestIds: [request.id],
          lines: [{ productId: request.productId, expectedQty: request.suggestedQty }],
        },
      },
    });
  };

  const approveOnly = () => run("approve", () => api.approvePurchaseRequest({ purchaseRequestId: request.id }));
  const approveAndFulfill = () =>
    run("approve", async () => {
      await api.approvePurchaseRequest({ purchaseRequestId: request.id });
      goFulfill();
    });
  const reject = () => {
    const note = window.prompt("Reason for rejecting this request (optional):") ?? undefined;
    return run("reject", () => api.rejectPurchaseRequest({ purchaseRequestId: request.id, note }));
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Parameters<typeof api.updatePurchaseRequest>[0] = {
      purchaseRequestId: request.id,
      description,
    };
    if (isReorder || type === "NEW_PRODUCT") {
      const q = parseInteger(qty, 0);
      if (isReorder && q < 1) {
        setError("Quantity must be at least 1.");
        return;
      }
      payload.suggestedQty = q;
    }
    if (!isReorder) {
      if (!subject.trim()) {
        setError("Enter a name for what you're requesting.");
        return;
      }
      payload.subject = subject.trim();
    }
    setSaving(true);
    setError(null);
    try {
      await api.updatePurchaseRequest(payload);
      setEditing(false);
    } catch (err) {
      setError(callableErrorMessage(err, "Failed to save changes"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={requestTitle(request)}
        actions={
          <button onClick={() => navigate("/activity")} className="btn-secondary">
            <ArrowLeft size={16} /> Back
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-lg font-semibold text-slate-900">{requestTitle(request)}</h2>
        <span className={meta.badge}>{meta.label}</span>
        <span className={statusBadgeClass(request.status)}>{request.status}</span>
        {request.origin === "ADMIN" && <span className="text-xs text-slate-400">admin initiated</span>}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="stagger-children space-y-4">
          {/* Summary */}
          <div className="card hover-lift">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Request details</h3>
              {canEdit && !editing && (
                <button onClick={beginEdit} className="btn-secondary px-3 py-1 text-sm">
                  <Pencil size={14} /> Edit
                </button>
              )}
            </div>

            {!editing ? (
              <div className="mt-2">
                <InfoRow label="Type" value={meta.label} />
                <InfoRow label={isReorder ? "Product" : "Name"} value={requestTitle(request)} />
                {request.suggestedQty != null && <InfoRow label="Quantity" value={request.suggestedQty} />}
                {isReorder && request.currentStock != null && (
                  <InfoRow label="Current stock" value={request.currentStock} />
                )}
                <InfoRow label="Branch" value={branch?.name ?? request.branchId ?? "—"} />
                <InfoRow label="Requested by" value={request.requestedByName || "Staff"} />
                <InfoRow label="Created" value={formatDate(request.createdAt)} />
                {request.reviewedByName && (
                  <InfoRow
                    label={request.status === "REJECTED" ? "Rejected by" : "Reviewed by"}
                    value={request.reviewedByName}
                  />
                )}
                {request.reviewNote && <InfoRow label="Review note" value={`“${request.reviewNote}”`} />}
                {request.fulfilledByName && (
                  <InfoRow label="Fulfilled by" value={request.fulfilledByName} />
                )}
                <div className="pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Description</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {request.description || request.notes || "—"}
                  </p>
                </div>
                {request.purchaseOrderId && (
                  <button
                    onClick={() => navigate(`/deliveries/${request.purchaseOrderId}`)}
                    className="mt-3 text-sm text-brand-600 hover:underline"
                  >
                    View linked purchase order →
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={saveEdit} className="mt-3 space-y-4" noValidate>
                {!isReorder && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {type === "NEW_PRODUCT" ? "Product name *" : type === "NEW_CATEGORY" ? "Category name *" : "Supplier name *"}
                    </label>
                    <input
                      className="input-field"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                )}
                {(isReorder || type === "NEW_PRODUCT") && (
                  <IntegerInput
                    label={isReorder ? "Quantity needed *" : "Quantity needed (optional)"}
                    value={qty}
                    onChange={setQty}
                    placeholder="e.g. 24"
                  />
                )}
                <div>
                  <label className="mb-1 block text-sm font-medium">Description</label>
                  <textarea
                    className="input-field"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Explain what & why so the admin understands."
                  />
                </div>
                {isRejected && (
                  <p className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-700">
                    Saving will resubmit this rejected request for review.
                  </p>
                )}
                <div className="form-actions">
                  <button type="button" onClick={() => setEditing(false)} className="btn-secondary" disabled={saving}>
                    <X size={16} /> Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? "Saving..." : isRejected ? "Save & resubmit" : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Admin actions */}
          {isAdmin && (isOpen || request.status === "APPROVED") && !editing && (
            <div className="card">
              <h3 className="mb-3 font-semibold text-slate-900">Admin actions</h3>
              <div className="flex flex-wrap gap-2">
                {isOpen && isReorder && (
                  <>
                    <button onClick={createPoFromRequest} className="btn-primary px-3 py-1.5 text-sm">
                      <ShoppingCart size={14} /> Approve &amp; create PO
                    </button>
                    <button onClick={approveOnly} disabled={busy === "approve"} className="btn-secondary px-3 py-1.5 text-sm">
                      <CheckCircle2 size={14} /> Approve only
                    </button>
                  </>
                )}
                {isOpen && !isReorder && (
                  <button onClick={approveAndFulfill} disabled={busy === "approve"} className="btn-primary px-3 py-1.5 text-sm">
                    <Plus size={14} /> Approve &amp; create
                  </button>
                )}
                {isOpen && (
                  <button onClick={reject} disabled={busy === "reject"} className="btn-secondary px-3 py-1.5 text-sm text-red-600">
                    <XCircle size={14} /> Reject
                  </button>
                )}
                {request.status === "APPROVED" && isReorder && (
                  <button onClick={createPoFromRequest} className="btn-primary px-3 py-1.5 text-sm">
                    <ShoppingCart size={14} /> Create PO
                  </button>
                )}
                {request.status === "APPROVED" && !isReorder && meta.createPath && (
                  <button onClick={goFulfill} className="btn-primary px-3 py-1.5 text-sm">
                    <Plus size={14} /> Create {meta.label.toLowerCase()}
                  </button>
                )}
              </div>
            </div>
          )}

          <ProcurementTimeline requestId={request.id} />
        </div>

        <ThreadPanel
          contextType="PURCHASE_REQUEST"
          contextId={request.id}
          title={`Request · ${requestTitle(request)}`}
          branchId={request.branchId}
          heading="Discussion"
        />
      </div>
    </div>
  );
}
