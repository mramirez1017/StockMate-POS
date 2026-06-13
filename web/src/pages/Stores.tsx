import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { Plus, Pencil, Store as StoreIcon, LayoutDashboard } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Store } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
export default function Stores() {
  const { isPlatformOwner, setAnalyticsStoreId } = useAuth();
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", branchName: "Main Branch", address: "", phone: "" });
  const [editForm, setEditForm] = useState({ name: "", address: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlatformOwner) return;
    return onSnapshot(collection(db, "stores"), (snap) => {
      setStores(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Store));
      setLoading(false);
    });
  }, [isPlatformOwner]);

  if (!isPlatformOwner) return <Navigate to="/" replace />;
  if (loading) return <LoadingSpinner />;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createStore(createForm);
      setCreateOpen(false);
      setCreateForm({ name: "", branchName: "Main Branch", address: "", phone: "" });
    } catch (err) {
      setError((err as Error).message ?? "Failed to create store");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (store: Store) => {
    setEditing(store);
    setEditForm({ name: store.name, address: store.address ?? "", phone: store.phone ?? "" });
    setError(null);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db, "stores", editing.id), {
        name: editForm.name.trim(),
        address: editForm.address || undefined,
        phone: editForm.phone || undefined,
        updatedAt: Date.now(),
      });
      setEditOpen(false);
      setEditing(null);
    } catch (err) {
      setError((err as Error).message ?? "Failed to update store");
    } finally {
      setSaving(false);
    }
  };

  const openStoreConsole = async (store: Store) => {
    await setAnalyticsStoreId(store.id);
    navigate("/dashboard");
  };

  return (
    <div>
      <PageHeader
        title="Stores"
        actions={
          <button onClick={() => { setError(null); setCreateOpen(true); }} className="btn-primary">
            <Plus size={18} /> New Store
          </button>
        }
      />

      <DataTable
        data={stores}
        keyField="id"
        columns={[
          { key: "name", header: "Store Name", sortValue: (s) => s.name, render: (s) => s.name },
          { key: "address", header: "Address", sortValue: (s) => s.address ?? "", render: (s) => s.address ?? "—" },
          { key: "phone", header: "Phone", sortValue: (s) => s.phone ?? "", render: (s) => s.phone ?? "—" },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (s) => (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void openStoreConsole(s)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline"
                >
                  <LayoutDashboard size={14} /> View data
                </button>
                <button onClick={() => openEdit(s)} className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
                  <Pencil size={14} /> Edit
                </button>
              </div>
            ),
          },
        ]}
      />

      {stores.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <StoreIcon className="mb-4 text-slate-300" size={48} />
          <p className="text-slate-600">No stores yet. Create your first store, then add a store admin from Users.</p>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Store">
        <form onSubmit={handleCreate} className="grid gap-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-sm font-medium">Store Name *</label>
            <input
              className="input-field"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Pharmacy Plus"
            />
            <p className="mt-1 text-xs text-slate-500">Your business or brand name.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">First Branch Name *</label>
            <input
              className="input-field"
              required
              value={createForm.branchName}
              onChange={(e) => setCreateForm({ ...createForm, branchName: e.target.value })}
              placeholder="e.g. Main Branch, QC Store"
            />
            <p className="mt-1 text-xs text-slate-500">
              Physical location name — should differ from the store name (not also &quot;Pharmacy&quot; unless it is a location label).
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Address</label>
            <input className="input-field" value={createForm.address} onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <input className="input-field" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating..." : "Create Store"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Store">
        <form onSubmit={handleEdit} className="grid gap-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-sm font-medium">Store Name *</label>
            <input className="input-field" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Address</label>
            <input className="input-field" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <input className="input-field" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Save Changes"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
