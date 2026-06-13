import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, doc } from "firebase/firestore";
import { Plus } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Promo, PromoType, Product, Category } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import IntegerInput from "@/components/IntegerInput";
import DecimalInput from "@/components/DecimalInput";
import { formatDateInput, statusBadgeClass } from "@/lib/format";
import { formatProductLabel } from "@/lib/productUnits";
import { parseInteger } from "@/lib/integerInput";
import { parseOneDecimal } from "@/lib/moneyInput";

function emptyPromoForm() {
  return {
    name: "",
    type: "PERCENTAGE" as PromoType,
    discountValue: "",
    startDate: formatDateInput(),
    endDate: formatDateInput(new Date(Date.now() + 30 * 86400000)),
    productId: "",
    categoryId: "",
    status: "ACTIVE" as const,
    minQuantity: "",
    minSpend: "",
    buyQuantity: "",
    getQuantity: "",
  };
}

export default function Promos() {
  const { storeId } = useAuth();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyPromoForm());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    const u1 = onSnapshot(collection(db, "stores", storeId, "promos"), (s) => { setPromos(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Promo)); setLoading(false); });
    const u2 = onSnapshot(collection(db, "stores", storeId, "products"), (s) => setProducts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)));
    const u3 = onSnapshot(collection(db, "stores", storeId, "categories"), (s) => setCategories(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Category)));
    return () => { u1(); u2(); u3(); };
  }, [storeId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    const discountValue = parseOneDecimal(form.discountValue);
    if (discountValue == null) return;
    await addDoc(collection(db, "stores", storeId, "promos"), {
      name: form.name,
      type: form.type,
      discountValue,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      storeId,
      usageCount: 0,
      productId: form.productId || undefined,
      categoryId: form.categoryId || undefined,
      minQuantity: form.minQuantity.trim() ? parseInteger(form.minQuantity, 0) : undefined,
      minSpend: form.minSpend.trim() ? parseOneDecimal(form.minSpend) ?? undefined : undefined,
      buyQuantity: form.type === "BUY_X_GET_Y" ? parseInteger(form.buyQuantity, 2) : undefined,
      getQuantity: form.type === "BUY_X_GET_Y" ? parseInteger(form.getQuantity, 1) : undefined,
      createdAt: Date.now(),
    });
    setModalOpen(false);
    setForm(emptyPromoForm());
  };

  const toggleStatus = async (promo: Promo) => {
    if (!storeId) return;
    await updateDoc(doc(db, "stores", storeId, "promos", promo.id), {
      status: promo.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
    });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Promos" actions={<button onClick={() => { setForm(emptyPromoForm()); setModalOpen(true); }} className="btn-primary"><Plus size={18} /> Create Promo</button>} />
      <DataTable data={promos} keyField="id" columns={[
        { key: "name", header: "Name", sortValue: (p) => p.name, render: (p) => p.name },
        { key: "type", header: "Type", sortValue: (p) => p.type, render: (p) => p.type },
        { key: "value", header: "Value", sortValue: (p) => p.discountValue, render: (p) => p.type === "PERCENTAGE" ? `${p.discountValue}%` : p.discountValue },
        { key: "dates", header: "Period", sortValue: (p) => p.startDate, render: (p) => `${p.startDate} → ${p.endDate}` },
        { key: "usage", header: "Usage", sortValue: (p) => p.usageCount ?? 0, render: (p) => `${p.usageCount ?? 0}${p.usageLimit ? `/${p.usageLimit}` : ""}` },
        { key: "status", header: "Status", sortValue: (p) => p.status, render: (p) => <span className={statusBadgeClass(p.status)}>{p.status}</span> },
        { key: "actions", header: "", sortable: false, render: (p) => <button onClick={() => toggleStatus(p)} className="text-sm text-brand-600 hover:underline">{p.status === "ACTIVE" ? "Deactivate" : "Activate"}</button> },
      ]} />
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Promo" wide>
        <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium">Promo Name *</label><input className="input-field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="mb-1 block text-sm font-medium">Type *</label>
            <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PromoType })}>
              <option value="PERCENTAGE">Percentage Discount</option>
              <option value="FIXED">Fixed Discount</option>
              <option value="PROMO_PRICE">Promo Price</option>
              <option value="BUY_X_GET_Y">Buy X Get Y</option>
            </select>
          </div>
          <DecimalInput
            label="Discount Value *"
            value={form.discountValue}
            onChange={(discountValue) => setForm({ ...form, discountValue })}
            placeholder={form.type === "PERCENTAGE" ? "e.g. 10" : "e.g. 99.5"}
            required
            decimals={form.type === "PERCENTAGE" ? 1 : 2}
          />
          {form.type === "BUY_X_GET_Y" && (
            <>
              <IntegerInput
                label="Buy Quantity"
                value={form.buyQuantity}
                onChange={(buyQuantity) => setForm({ ...form, buyQuantity })}
                placeholder="e.g. 2"
              />
              <IntegerInput
                label="Get Free"
                value={form.getQuantity}
                onChange={(getQuantity) => setForm({ ...form, getQuantity })}
                placeholder="e.g. 1"
              />
            </>
          )}
          <div><label className="mb-1 block text-sm font-medium">Start Date</label><input type="date" className="input-field" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div><label className="mb-1 block text-sm font-medium">End Date</label><input type="date" className="input-field" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          <div><label className="mb-1 block text-sm font-medium">Product (optional)</label><select className="input-field" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Any</option>{products.map((p) => <option key={p.id} value={p.id}>{formatProductLabel(p)}</option>)}</select></div>
          <div><label className="mb-1 block text-sm font-medium">Category (optional)</label><select className="input-field" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">Any</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="form-actions sm:col-span-2"><button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button><button type="submit" className="btn-primary">Create</button></div>
        </form>
      </Modal>
    </div>
  );
}
