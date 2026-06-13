import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Store } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function Settings() {
  const { storeId } = useAuth();
  const [store, setStore] = useState<Partial<Store>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    getDoc(doc(db, "stores", storeId)).then((snap) => {
      if (snap.exists()) setStore({ id: snap.id, ...snap.data() } as Store);
      setLoading(false);
    });
  }, [storeId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    setSaving(true);
    await updateDoc(doc(db, "stores", storeId), { ...store, updatedAt: Date.now() });
    setSaving(false);
    alert("Settings saved");
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Store profile and business configuration" />
      <form onSubmit={handleSave} className="card space-y-6">
        <section>
          <h2 className="mb-4 font-semibold">Store Profile</h2>
          <div className="space-y-4">
            <div><label className="mb-1 block text-sm font-medium">Store Name</label><input className="input-field" value={store.name ?? ""} onChange={(e) => setStore({ ...store, name: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm font-medium">Address</label><textarea className="input-field" value={store.address ?? ""} onChange={(e) => setStore({ ...store, address: e.target.value })} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium">Phone</label><input className="input-field" value={store.phone ?? ""} onChange={(e) => setStore({ ...store, phone: e.target.value })} /></div>
              <div><label className="mb-1 block text-sm font-medium">Email</label><input className="input-field" value={store.email ?? ""} onChange={(e) => setStore({ ...store, email: e.target.value })} /></div>
            </div>
          </div>
        </section>
        <section>
          <h2 className="mb-4 font-semibold">Pricing</h2>
          <p className="text-sm text-slate-600">
            Selling prices on products are the final amount charged at POS. No separate tax is added at checkout.
          </p>
        </section>
        <section>
          <h2 className="mb-4 font-semibold">Receipt Settings</h2>
          <div className="space-y-4">
            <div><label className="mb-1 block text-sm font-medium">Receipt Header</label><input className="input-field" value={store.receiptHeader ?? ""} onChange={(e) => setStore({ ...store, receiptHeader: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm font-medium">Receipt Footer</label><input className="input-field" value={store.receiptFooter ?? ""} onChange={(e) => setStore({ ...store, receiptFooter: e.target.value })} /></div>
          </div>
        </section>
        <section>
          <h2 className="mb-4 font-semibold">Payment Methods</h2>
          <input className="input-field" placeholder="Cash, Card, GCash (comma separated)" value={(store.paymentMethods ?? []).join(", ")} onChange={(e) => setStore({ ...store, paymentMethods: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </section>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Save Settings"}</button>
      </form>
    </div>
  );
}
