import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { PurchaseOrder } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import IntegerInput from "@/components/IntegerInput";
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
  const { storeId } = useAuth();
  const navigate = useNavigate();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<ReceiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId || !poId) return;
    getDoc(doc(db, "stores", storeId, "purchaseOrders", poId)).then((snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as PurchaseOrder;
        setPo(data);
        setItems(data.items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          expectedQty: i.expectedQty,
          receivedQty: String(i.expectedQty),
          damagedQty: "",
          expiryDate: "",
          remarks: "",
        })));
      }
      setLoading(false);
    });
  }, [storeId, poId]);

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

  return (
    <div>
      <PageHeader title={`Delivery Checklist — ${po.poNumber}`} description={`Expected: ${po.expectedDeliveryDate}`} />
      <form onSubmit={handleSubmit} className="space-y-4">
        {items.map((item, idx) => (
          <div key={item.productId} className="card">
            <h3 className="font-semibold">{item.productName}</h3>
            <p className="text-sm text-slate-500 mb-4">Expected: {item.expectedQty}</p>
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
        ))}
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <div className="form-actions">
          <button type="button" onClick={() => navigate("/deliveries")} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Saving..." : "Complete Receiving"}</button>
        </div>
      </form>
    </div>
  );
}
