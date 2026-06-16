import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteField } from "firebase/firestore";
import { Plus } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Category, EntityStatus } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import { statusBadgeClass } from "@/lib/format";
import { isStoreAdmin } from "@/lib/permissions";
import { api } from "@/lib/api";

interface CategoryForm {
  name: string;
  description: string;
  requiresExpiryDate: boolean;
  status: EntityStatus;
}

function categoryWritePayload(form: CategoryForm, editing: boolean) {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    requiresExpiryDate: form.requiresExpiryDate,
    status: form.status,
    updatedAt: Date.now(),
  };
  const description = form.description.trim();
  if (description) {
    payload.description = description;
  } else if (editing) {
    payload.description = deleteField();
  }
  return payload;
}

function emptyForm(): CategoryForm {
  return {
    name: "",
    description: "",
    requiresExpiryDate: false,
    status: "ACTIVE",
  };
}

export default function Categories() {
  const { storeId, user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fulfillRequestId, setFulfillRequestId] = useState<string | null>(null);

  const canManage = user ? isStoreAdmin(user) : false;
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!storeId) return;
    return onSnapshot(collection(db, "stores", storeId, "categories"), (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category));
      setLoading(false);
    });
  }, [storeId]);

  useEffect(() => {
    const st = location.state as { openCreate?: boolean; prefillName?: string; fulfillRequestId?: string } | null;
    if (st?.openCreate && canManage) {
      setEditing(null);
      setForm({ ...emptyForm(), name: st.prefillName ?? "" });
      setFulfillRequestId(st.fulfillRequestId ?? null);
      setFormError(null);
      setModalOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, canManage, navigate]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      requiresExpiryDate: c.requiresExpiryDate ?? false,
      status: c.status,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    if (!canManage) {
      setFormError("Only store admins can add or edit categories.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = categoryWritePayload(form, !!editing);
      if (editing) {
        await updateDoc(doc(db, "stores", storeId, "categories", editing.id), payload);
      } else {
        const ref = await addDoc(collection(db, "stores", storeId, "categories"), {
          ...payload,
          storeId,
          createdAt: Date.now(),
        });
        if (fulfillRequestId) {
          try {
            await api.fulfillPurchaseRequest({
              purchaseRequestId: fulfillRequestId,
              resultId: ref.id,
              resultName: payload.name as string,
            });
          } catch {
            // The category was created; linking is best-effort.
          }
          setFulfillRequestId(null);
        }
      }
      setModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save category";
      setFormError(
        message.includes("permission") || message.includes("PERMISSION_DENIED")
          ? "You do not have permission to save categories. Admin access is required."
          : message,
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Group products for browsing and reports. Reorder and critical levels are set on each product."
        actions={
          canManage ? (
            <button onClick={openCreate} className="btn-primary">
              <Plus size={18} /> Add Category
            </button>
          ) : undefined
        }
      />
      <DataTable
        data={categories}
        keyField="id"
        columns={[
          { key: "name", header: "Name", sortValue: (c) => c.name, render: (c) => c.name },
          { key: "expiry", header: "Requires Expiry", sortValue: (c) => (c.requiresExpiryDate ? 1 : 0), render: (c) => (c.requiresExpiryDate ? "Yes" : "No") },
          { key: "status", header: "Status", sortValue: (c) => c.status, render: (c) => <span className={statusBadgeClass(c.status)}>{c.status}</span> },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (c) =>
              canManage ? (
                <button onClick={() => openEdit(c)} className="text-sm text-brand-600 hover:underline">
                  Edit
                </button>
              ) : null,
          },
        ]}
      />
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Category" : "Add Category"}>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Name *</label>
            <input
              className="input-field"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              className="input-field"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.requiresExpiryDate}
              onChange={(e) => setForm({ ...form, requiresExpiryDate: e.target.checked })}
            />
            Requires expiry date on receiving
          </label>
          <div className="form-actions">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving || !canManage} className="btn-primary">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
