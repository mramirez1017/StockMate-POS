import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { Plus, Pencil, MapPin } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Branch } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import { statusBadgeClass } from "@/lib/format";
import { api } from "@/lib/api";
import { callableErrorMessage } from "@/lib/callableError";
import { Navigate } from "react-router-dom";
import { isStoreAdmin } from "@/lib/permissions";

const emptyForm = { name: "", address: "", phone: "" };

export default function Branches() {
  const { storeId, user, store } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    return onSnapshot(collection(db, "stores", storeId, "branches"), (snap) => {
      setBranches(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Branch)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setLoading(false);
    });
  }, [storeId]);

  if (!user || !isStoreAdmin(user)) return <Navigate to="/dashboard" replace />;
  if (loading) return <LoadingSpinner />;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditing(branch);
    setForm({
      name: branch.name,
      address: branch.address ?? "",
      phone: branch.phone ?? "",
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const patch: Record<string, unknown> = {
          name: form.name.trim(),
          updatedAt: Date.now(),
        };
        if (form.address.trim()) patch.address = form.address.trim();
        if (form.phone.trim()) patch.phone = form.phone.trim();
        await updateDoc(doc(db, "stores", storeId, "branches", editing.id), patch);
      } else {
        await api.createBranch({
          name: form.name.trim(),
          ...(form.address.trim() ? { address: form.address.trim() } : {}),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        });
      }
      setModalOpen(false);
    } catch (err) {
      setError(callableErrorMessage(err, "Failed to save branch"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (branch: Branch) => {
    if (branch.status !== "ACTIVE") return;
    if (!confirm(`Deactivate branch "${branch.name}"? Staff must be reassigned first.`)) return;
    try {
      await api.deactivateBranch({ branchId: branch.id });
    } catch (err) {
      alert(callableErrorMessage(err, "Failed to deactivate"));
    }
  };

  const activeCount = branches.filter((b) => b.status === "ACTIVE").length;

  return (
    <div>
      <PageHeader
        title="Branches"
        description={
          store?.name
            ? `Store "${store.name}" can have multiple branch locations (e.g. Main Branch, Mall Branch). Each branch has its own stock and staff.`
            : "Manage physical branch locations for your store. Each branch tracks its own inventory."
        }
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus size={18} /> Add Branch
          </button>
        }
      />

      <DataTable
        data={branches}
        keyField="id"
        emptyMessage="No branches yet. Add your first branch location."
        columns={[
          {
            key: "name",
            header: "Branch Name",
            sortValue: (b) => b.name,
            render: (b) => (
              <span className="inline-flex items-center gap-2 font-medium">
                <MapPin size={16} className="text-emerald-600" />
                {b.name}
              </span>
            ),
          },
          { key: "address", header: "Address", sortValue: (b) => b.address ?? "", render: (b) => b.address ?? "—" },
          { key: "phone", header: "Phone", sortValue: (b) => b.phone ?? "", render: (b) => b.phone ?? "—" },
          {
            key: "status",
            header: "Status",
            sortValue: (b) => b.status,
            render: (b) => <span className={statusBadgeClass(b.status)}>{b.status}</span>,
          },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (b) => (
              <div className="flex gap-2">
                <button onClick={() => openEdit(b)} className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
                  <Pencil size={14} /> Edit
                </button>
                {b.status === "ACTIVE" && activeCount > 1 && (
                  <button onClick={() => handleDeactivate(b)} className="text-sm text-red-600 hover:underline">
                    Deactivate
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Branch" : "Add Branch"}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <strong>Store:</strong> {store?.name ?? "—"}
            <p className="mt-1 text-xs text-slate-500">
              Use a location name different from the store name (e.g. &quot;Main Branch&quot;, &quot;SM Mall&quot;).
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Branch Name *</label>
            <input
              className="input-field"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Main Branch, Quezon City"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Address</label>
            <textarea
              className="input-field"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editing ? "Save Changes" : "Add Branch"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
