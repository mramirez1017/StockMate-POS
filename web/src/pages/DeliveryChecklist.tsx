import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { BadgeCheck, Package, AlertTriangle } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { PurchaseOrder } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import IntegerInput from "@/components/IntegerInput";
import DeliveryProgress from "@/components/DeliveryProgress";
import ProcurementTimeline from "@/components/ProcurementTimeline";
import ThreadPanel from "@/components/ThreadPanel";
import { ProgressBar } from "@/components/Charts";
import { isStoreAdmin } from "@/lib/permissions";
import { isStoreWideAccess } from "@/lib/branchScope";
import { parseInteger } from "@/lib/integerInput";
import { api } from "@/lib/api";
import { callableErrorMessage } from "@/lib/callableError";

interface ReceiveItem {
  productId: string;
  productName: string;
  expectedQty: number;
  receivedQty: string;
  damagedQty: string;
  expiryDate: string;
  remarks: string;
}

export default function DeliveryChecklist() {
  const { poId } = useParams<{ poId: string }>();
  const { storeId, user } = useAuth();
  const navigate = useNavigate();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<ReceiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId || !poId) return;
    const unsub = onSnapshot(doc(db, "stores", storeId, "purchaseOrders", poId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as PurchaseOrder;
        setPo(data);
        setItems((prev) => {
          if (prev.length) return prev;
          return data.items.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            expectedQty: i.expectedQty,
            receivedQty: String(i.expectedQty),
            damagedQty: "",
            expiryDate: "",
            remarks: "",
          }));
        });
      }
      setLoading(false);
    });
    return () => unsub();
  }, [storeId, poId]);

  const handleComplete = async () => {
    if (!poId) return;
    setCompleting(true);
    setSubmitError(null);
    try {
      await api.updatePurchaseOrderStatus({ purchaseOrderId: poId, status: "COMPLETED" });
    } catch (err) {
      setSubmitError(callableErrorMessage(err, "Failed to complete the transaction"));
    } finally {
      setCompleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.receiveDelivery({
        purchaseOrderId: poId,
        items: items.map((i) => ({
          productId: i.productId,
          receivedQty: parseInteger(i.receivedQty, 0),
          damagedQty: parseInteger(i.damagedQty, 0) || undefined,
          expiryDate: i.expiryDate || undefined,
          remarks: i.remarks || undefined,
        })),
      });
      navigate("/deliveries");
    } catch (err) {
      setSubmitError(callableErrorMessage(err, "Failed to receive delivery"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!po) return <p>Purchase order not found</p>;
  if (user && !isStoreWideAccess(user) && po.branchId !== user.branchId) {
    return <p>This delivery belongs to another branch.</p>;
  }

  const closed = po.status === "RECEIVED" || po.status === "CANCELLED" || po.status === "COMPLETED";
  const fromRequest = !!po.purchaseRequestIds?.length;
  const canComplete =
    !!user && isStoreAdmin(user) && (po.status === "RECEIVED" || po.status === "PARTIALLY_RECEIVED");

  return (
    <div>
      <PageHeader title={`Delivery Checklist — ${po.poNumber}`} description={`Expected: ${po.expectedDeliveryDate}`} />

      <div className="card mb-4">
        <DeliveryProgress status={po.status} fromRequest={fromRequest} />
        {canComplete && (
          <div className="mt-4 flex flex-col items-start gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Delivery received. Close out this transaction once everything checks out.
            </p>
            <button onClick={handleComplete} disabled={completing} className="btn-primary">
              <BadgeCheck size={18} />
              {completing ? "Completing..." : "Complete & close"}
            </button>
          </div>
        )}
        {po.status === "COMPLETED" && (
          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-sm font-medium text-emerald-700">
            <BadgeCheck size={18} />
            Transaction closed{po.completedByName ? ` by ${po.completedByName}` : ""}.
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="scroll-area stagger-children max-h-[calc(100dvh-22rem)] space-y-4 pr-1">
        {items.map((item, idx) => {
          const received = parseInteger(item.receivedQty, 0);
          const damaged = parseInteger(item.damagedQty, 0);
          const pct = item.expectedQty > 0 ? Math.min(100, Math.round((received / item.expectedQty) * 100)) : 0;
          const complete = received >= item.expectedQty && item.expectedQty > 0;
          return (
          <div key={item.productId} className="card hover-lift">
            <div className="mb-3 flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${complete ? "bg-emerald-50 text-emerald-600" : "bg-brand-50 text-brand-600"}`}>
                <Package size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-slate-900">{item.productName}</h3>
                <p className="text-sm text-slate-500">Expected: {item.expectedQty}</p>
              </div>
              <span className={`badge ${complete ? "badge-green" : "badge-blue"}`}>
                {received}/{item.expectedQty}
              </span>
            </div>
            <ProgressBar value={pct} tone={complete ? "ok" : "brand"} size="sm" className="mb-4" />
            {damaged > 0 && (
              <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-amber-600">
                <AlertTriangle size={13} /> {damaged} flagged as damaged
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <IntegerInput
                label="Received Qty *"
                value={item.receivedQty}
                onChange={(receivedQty) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], receivedQty };
                  setItems(next);
                }}
                placeholder={String(item.expectedQty)}
                required
              />
              <IntegerInput
                label="Damaged Qty"
                value={item.damagedQty}
                onChange={(damagedQty) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], damagedQty };
                  setItems(next);
                }}
                placeholder="0"
              />
              <div>
                <label className="mb-1 block text-sm">Expiry Date</label>
                <input type="date" className="input-field" value={item.expiryDate}
                  onChange={(e) => { const n = [...items]; n[idx].expiryDate = e.target.value; setItems(n); }} />
              </div>
              <div>
                <label className="mb-1 block text-sm">Remarks</label>
                <input className="input-field" value={item.remarks}
                  onChange={(e) => { const n = [...items]; n[idx].remarks = e.target.value; setItems(n); }} />
              </div>
            </div>
          </div>
          );
        })}
        </div>
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <div className="form-actions">
          <button type="button" onClick={() => navigate("/deliveries")} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting || closed} className="btn-primary">
            {po.status === "RECEIVED"
              ? "Fully Received"
              : po.status === "COMPLETED"
                ? "Completed"
                : po.status === "CANCELLED"
                  ? "Cancelled"
                  : submitting
                    ? "Saving..."
                    : "Complete Receiving"}
          </button>
        </div>
      </form>

        <div className="space-y-4">
          <ThreadPanel
            contextType="PURCHASE_ORDER"
            contextId={po.id}
            title={`Delivery ${po.poNumber}`}
            branchId={po.branchId}
            heading="Delivery chat"
            className="h-fit"
          />
          <ProcurementTimeline poId={po.id} />
        </div>
      </div>
    </div>
  );
}
