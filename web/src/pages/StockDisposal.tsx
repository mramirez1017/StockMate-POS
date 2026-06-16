import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Product, Category, DisposalReason } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import IntegerInput from "@/components/IntegerInput";
import SearchableSelect from "@/components/SearchableSelect";
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ categoryId: "", productId: "", quantity: "", reason: "EXPIRED" as DisposalReason, remarks: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    const u1 = onSnapshot(collection(db, "stores", storeId, "products"), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product).filter((p) => p.status === "ACTIVE"));
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db, "stores", storeId, "categories"), (snap) =>
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category)),
    );
    return () => {
      u1();
      u2();
    };
  }, [storeId]);

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => !c.status || c.status === "ACTIVE")
        .map((c) => ({ value: c.id, label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );

  const productOptions = useMemo(
    () =>
      products
        .filter((p) => !form.categoryId || p.categoryId === form.categoryId)
        .map((p) => ({ value: p.id, label: formatProductLabel(p) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [products, form.categoryId],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      await api.createDisposal({
        branchId: user.branchId,
        productId: form.productId,
        reason: form.reason,
        remarks: form.remarks,
        quantity: Math.max(1, parseInteger(form.quantity, 1)),
      });
      setForm({ categoryId: "", productId: "", quantity: "", reason: "EXPIRED", remarks: "" });
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
        <SearchableSelect
          label="Category"
          value={form.categoryId}
          onChange={(categoryId) => setForm({ ...form, categoryId, productId: "" })}
          options={categoryOptions}
          placeholder="All categories"
          searchPlaceholder="Search categories..."
          emptyMessage="No categories found"
        />
        <SearchableSelect
          label="Product *"
          value={form.productId}
          onChange={(productId) => setForm({ ...form, productId })}
          options={productOptions}
          placeholder="Search or select product..."
          searchPlaceholder="Search products..."
          emptyMessage={form.categoryId ? "No products in this category" : "No products found"}
        />
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
