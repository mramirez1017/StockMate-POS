import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, doc } from "firebase/firestore";
import { Plus } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Supplier, EntityStatus } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import { statusBadgeClass } from "@/lib/format";

export default function Suppliers() {
  const { storeId } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", contactPerson: "", phoneNumber: "", email: "", address: "", notes: "", status: "ACTIVE" as EntityStatus });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    return onSnapshot(collection(db, "stores", storeId, "suppliers"), (snap) => {
      setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier));
      setLoading(false);
    });
  }, [storeId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    if (editing) {
      await updateDoc(doc(db, "stores", storeId, "suppliers", editing.id), { ...form, updatedAt: Date.now() });
    } else {
      await addDoc(collection(db, "stores", storeId, "suppliers"), { ...form, storeId, createdAt: Date.now(), updatedAt: Date.now() });
    }
    setModalOpen(false);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Suppliers" actions={<button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary"><Plus size={18} /> Add Supplier</button>} />
      <DataTable data={suppliers} keyField="id" columns={[
        { key: "name", header: "Name", sortValue: (s) => s.name, render: (s) => <span className="font-medium">{s.name}</span> },
        { key: "contact", header: "Contact", sortValue: (s) => s.contactPerson ?? "", render: (s) => s.contactPerson ?? "-" },
        { key: "phone", header: "Phone", sortValue: (s) => s.phoneNumber ?? "", render: (s) => s.phoneNumber ?? "-" },
        { key: "email", header: "Email", sortValue: (s) => s.email ?? "", render: (s) => s.email ?? "-" },
        { key: "status", header: "Status", sortValue: (s) => s.status, render: (s) => <span className={statusBadgeClass(s.status)}>{s.status}</span> },
        { key: "actions", header: "", sortable: false, render: (s) => <button onClick={() => { setEditing(s); setForm({ name: s.name, contactPerson: s.contactPerson ?? "", phoneNumber: s.phoneNumber ?? "", email: s.email ?? "", address: s.address ?? "", notes: s.notes ?? "", status: s.status }); setModalOpen(true); }} className="text-brand-600 text-sm hover:underline">Edit</button> },
      ]} />
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Supplier" : "Add Supplier"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium">Supplier Name *</label><input className="input-field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="mb-1 block text-sm font-medium">Contact Person</label><input className="input-field" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="mb-1 block text-sm font-medium">Phone</label><input className="input-field" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} /></div>
            <div><label className="mb-1 block text-sm font-medium">Email</label><input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div><label className="mb-1 block text-sm font-medium">Address</label><textarea className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="form-actions"><button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button><button type="submit" className="btn-primary">Save</button></div>
        </form>
      </Modal>
    </div>
  );
}
