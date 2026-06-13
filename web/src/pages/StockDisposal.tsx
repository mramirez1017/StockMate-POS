import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Product, DisposalReason } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import IntegerInput from "@/components/IntegerInput";
import { parseInteger } from "@/lib/integerInput";
import { api } from "@/lib/api";
import { formatProductLabel } from "@/lib/productUnits";

const REASONS: { value: DisposalReason; label: string }[] = [
  { value: "EXPIRED", label: "Expired" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "SPOILED", label: "Spoiled" },
  { value: "LOST", label: "Lost" },
  { value: "RETURNED_TO_SUPPLIER", label: "Returned to Supplier" },
  { value: "DISPOSED", label: "Disposed" },
  { value: "OTHER", label: "Other" },
];

export default function StockDisposal() {
  const { storeId, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ productId: "", quantity: "", reason: "EXPIRED" as DisposalReason, remarks: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    return onSnapshot(collection(db, "stores", storeId, "products"), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product).filter((p) => p.status === "ACTIVE"));
      setLoading(false);
    });
  }, [storeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      await api.createDisposal({ branchId: user.branchId, ...form, quantity: Math.max(1, parseInteger(form.quantity, 1)) });
      setForm({ productId: "", quantity: "", reason: "EXPIRED", remarks: "" });
      alert("Disposal recorded successfully");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-xl">
      <PageHeader title="Stock Disposal" description="Tag expired, damaged, or disposed items" />
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Product *</label>
          <select className="input-field" required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
            <option value="">Select or scan product...</option>
            {products.map((p) => <option key={p.id} value={p.id}>{formatProductLabel(p)}</option>)}
          </select>
        </div>
        <IntegerInput
          label="Quantity *"
          value={form.quantity}
          onChange={(quantity) => setForm({ ...form, quantity })}
          placeholder="e.g. 5"
          required
        />
        <div>
          <label className="mb-1 block text-sm font-medium">Reason *</label>
          <select className="input-field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value as DisposalReason })}>
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Remarks</label>
          <textarea className="input-field" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full">{submitting ? "Submitting..." : "Submit Disposal"}</button>
      </form>
    </div>
  );
}
