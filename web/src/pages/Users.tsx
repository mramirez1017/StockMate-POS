import { useEffect, useState } from "react";
import { collection, onSnapshot, updateDoc, doc, query, where } from "firebase/firestore";
import { Plus } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { User, UserRole, Branch, CustomPermissions, RegisteredEmail, Store } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import { statusBadgeClass } from "@/lib/format";
import { api } from "@/lib/api";
import { canRegisterUsers } from "@/lib/permissions";
import { branchLabel } from "@/lib/branchScope";
import { callableErrorMessage } from "@/lib/callableError";
import { Navigate, useSearchParams } from "react-router-dom";

const defaultForm = (isPlatformOwner: boolean) => ({
  fullName: "",
  email: "",
  role: (isPlatformOwner ? "ADMIN" : "CASHIER") as UserRole,
  storeId: "",
  branchId: "",
  phoneNumber: "",
  permissions: {} as CustomPermissions,
});

function PlatformOwnerUsers() {
  const [stores, setStores] = useState<Store[]>([]);
  const [registrations, setRegistrations] = useState<RegisteredEmail[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm(true));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "stores"), (s) => {
      setStores(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Store));
    });
    const u2 = onSnapshot(collection(db, "registeredEmails"), (s) => {
      setRegistrations(s.docs.map((d) => ({ id: d.id, ...d.data() }) as RegisteredEmail));
      setLoading(false);
    });
    return () => {
      u1();
      u2();
    };
  }, []);

  const storeName = (id?: string) => stores.find((s) => s.id === id)?.name ?? "—";
  const pending = registrations.filter((r) => !r.claimed);
  const active = registrations.filter((r) => r.claimed && (r.role === "ADMIN" || r.role === "PLATFORM_OWNER"));

  const openModal = () => {
    setError(null);
    setForm(defaultForm(true));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.registerUserEmail({
        email: form.email,
        fullName: form.fullName,
        role: form.role,
        storeId: form.role === "PLATFORM_OWNER" ? undefined : form.storeId || undefined,
        phoneNumber: form.phoneNumber || undefined,
      });
      setModalOpen(false);
      setForm(defaultForm(true));
    } catch (err) {
      setError(callableErrorMessage(err, "Failed to register user"));
    } finally {
      setSaving(false);
    }
  };

  const cancelPending = async (r: RegisteredEmail) => {
    await api.deactivateRegisteredEmail({ emailKey: r.id });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Users"
        actions={
          <button onClick={openModal} className="btn-primary">
            <Plus size={18} /> Register User
          </button>
        }
      />

      {pending.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Awaiting first sign-in</h3>
          <DataTable
            data={pending}
            keyField="id"
            columns={[
              { key: "name", header: "Name", sortValue: (r) => r.fullName, render: (r) => r.fullName },
              { key: "email", header: "Email", sortValue: (r) => r.email, render: (r) => r.email },
              { key: "role", header: "Role", sortValue: (r) => r.role, render: (r) => r.role.replace(/_/g, " ") },
              { key: "store", header: "Store", sortValue: (r) => (r.storeId ? storeName(r.storeId) : "Platform"), render: (r) => (r.storeId ? storeName(r.storeId) : "Platform") },
              { key: "status", header: "Status", sortValue: (r) => r.status, render: (r) => <span className={statusBadgeClass(r.status)}>{r.status}</span> },
              {
                key: "actions",
                header: "",
                sortable: false,
                render: (r) => (
                  <button onClick={() => cancelPending(r)} className="text-sm text-red-600 hover:underline">
                    Cancel
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Active users</h3>
      {active.length > 0 ? (
        <DataTable
          data={active}
          keyField="id"
          columns={[
            { key: "name", header: "Name", sortValue: (r) => r.fullName, render: (r) => r.fullName },
            { key: "email", header: "Email", sortValue: (r) => r.email, render: (r) => r.email },
            { key: "role", header: "Role", sortValue: (r) => r.role, render: (r) => r.role.replace(/_/g, " ") },
            { key: "store", header: "Store", sortValue: (r) => (r.storeId ? storeName(r.storeId) : "Platform"), render: (r) => (r.storeId ? storeName(r.storeId) : "Platform") },
            { key: "status", header: "Status", sortValue: (r) => r.status, render: (r) => <span className={statusBadgeClass(r.status)}>{r.status}</span> },
          ]}
        />
      ) : (
        <p className="text-slate-500">No active platform or store admin users yet.</p>
      )}

      <PlatformUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        form={form}
        setForm={setForm}
        onSubmit={handleSave}
        saving={saving}
        error={error}
        stores={stores}
      />
    </div>
  );
}

function PlatformUserModal({
  open,
  onClose,
  form,
  setForm,
  onSubmit,
  saving,
  error,
  stores,
}: {
  open: boolean;
  onClose: () => void;
  form: ReturnType<typeof defaultForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof defaultForm>>>;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  stores: Store[];
}) {
  const needsStore = form.role === "ADMIN";

  return (
    <Modal open={open} onClose={onClose} title="Register User" wide>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        {error && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">Full Name *</label>
          <input className="input-field" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email *</label>
          <input type="email" className="input-field" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Role *</label>
          <select
            className="input-field"
            value={form.role}
            onChange={(e) => {
              const role = e.target.value as UserRole;
              setForm({ ...form, role, storeId: role === "PLATFORM_OWNER" ? "" : form.storeId });
            }}
          >
            <option value="PLATFORM_OWNER">Platform Owner</option>
            <option value="ADMIN">Store Admin</option>
          </select>
        </div>
        {needsStore && (
          <div>
            <label className="mb-1 block text-sm font-medium">Store *</label>
            <select
              className="input-field"
              required
              value={form.storeId}
              onChange={(e) => setForm({ ...form, storeId: e.target.value })}
            >
              <option value="">Select store...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-actions sm:col-span-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Register User"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StoreAdminUsers() {
  const { storeId, user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pending, setPending] = useState<RegisteredEmail[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm(false));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    const u1 = onSnapshot(collection(db, "stores", storeId, "users"), (s) => {
      setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }) as User));
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db, "stores", storeId, "branches"), (s) =>
      setBranches(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Branch))
    );
    const u3 = onSnapshot(query(collection(db, "registeredEmails"), where("storeId", "==", storeId)), (s) => {
      setPending(s.docs.map((d) => ({ id: d.id, ...d.data() }) as RegisteredEmail).filter((r) => !r.claimed));
    });
    return () => {
      u1();
      u2();
      u3();
    };
  }, [storeId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    setSaving(true);
    setError(null);
    try {
      await api.registerUserEmail({
        email: form.email,
        fullName: form.fullName,
        role: form.role,
        storeId,
        branchId: form.branchId || undefined,
        phoneNumber: form.phoneNumber || undefined,
        permissions: Object.keys(form.permissions).length ? form.permissions : undefined,
      });
      setModalOpen(false);
      setForm(defaultForm(false));
    } catch (err) {
      setError(callableErrorMessage(err, "Failed to register user"));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (u: User) => {
    if (!storeId) return;
    await updateDoc(doc(db, "stores", storeId, "users", u.id), {
      status: u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      updatedAt: Date.now(),
    });
  };

  const cancelPending = async (r: RegisteredEmail) => {
    await api.deactivateRegisteredEmail({ emailKey: r.id });
  };

  if (!storeId || !user) return <Navigate to="/login" replace />;
  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Users"
        actions={
          <button onClick={() => { setError(null); setForm(defaultForm(false)); setModalOpen(true); }} className="btn-primary">
            <Plus size={18} /> Register User
          </button>
        }
      />

      {pending.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Awaiting first sign-in</h3>
          <DataTable
            data={pending}
            keyField="id"
            columns={[
              { key: "name", header: "Name", sortValue: (r) => r.fullName, render: (r) => r.fullName },
              { key: "email", header: "Email", sortValue: (r) => r.email, render: (r) => r.email },
              { key: "role", header: "Role", sortValue: (r) => r.role, render: (r) => r.role.replace(/_/g, " ") },
              { key: "branch", header: "Branch", sortValue: (r) => branches.find((b) => b.id === r.branchId)?.name ?? "", render: (r) => branches.find((b) => b.id === r.branchId)?.name ?? "—" },
              {
                key: "actions",
                header: "",
                sortable: false,
                render: (r) => (
                  <button onClick={() => cancelPending(r)} className="text-sm text-red-600 hover:underline">
                    Cancel
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Active users</h3>
      <DataTable
        data={users}
        keyField="id"
        columns={[
          { key: "name", header: "Name", sortValue: (u) => u.fullName, render: (u) => u.fullName },
          { key: "email", header: "Email", sortValue: (u) => u.email, render: (u) => u.email },
          { key: "role", header: "Role", sortValue: (u) => u.role, render: (u) => u.role.replace(/_/g, " ") },
          { key: "branch", header: "Branch", sortValue: (u) => branchLabel(u, branches), render: (u) => branchLabel(u, branches) },
          { key: "status", header: "Status", sortValue: (u) => u.status, render: (u) => <span className={statusBadgeClass(u.status)}>{u.status}</span> },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (u) => (
              <button onClick={() => toggleStatus(u)} className="text-sm text-brand-600 hover:underline">
                {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </button>
            ),
          },
        ]}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Register User" wide>
        <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
          {error && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-sm font-medium">Full Name *</label>
            <input className="input-field" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email *</label>
            <input type="email" className="input-field" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Role *</label>
            <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              <option value="STORE_MANAGER">Branch Manager</option>
              <option value="CASHIER">Cashier</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Branch *</label>
            <select className="input-field" required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">Select branch...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 space-y-2">
            <p className="text-sm font-medium">Custom Permissions</p>
            {(["canVoidSale", "canApproveStockAdjustment", "canViewSupplierCost", "canCreatePurchaseRequest", "canChangePrice"] as const).map(
              (key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.permissions[key]}
                    onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, [key]: e.target.checked } })}
                  />
                  {key.replace(/([A-Z])/g, " $1").replace("can ", "")}
                </label>
              )
            )}
          </div>
          <div className="form-actions sm:col-span-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Register User"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function UsersPage() {
  const { user, isPlatformOwner, analyticsStoreId, store } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = canRegisterUsers(user, isPlatformOwner);

  if (!canManage) {
    return (
      <div className="rounded-xl bg-white p-8 text-center text-slate-600">
        You do not have permission to manage users.
      </div>
    );
  }

  if (isPlatformOwner) {
    if (!analyticsStoreId) return <PlatformOwnerUsers />;

    const tab = searchParams.get("tab") === "store" ? "store" : "platform";
    return (
      <div>
        <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
          <button
            type="button"
            onClick={() => setSearchParams({ tab: "platform" })}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "platform"
                ? "bg-emerald-100 text-emerald-800"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Platform registrations
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ tab: "store" })}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "store"
                ? "bg-emerald-100 text-emerald-800"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {store?.name ?? "Store"} staff
          </button>
        </div>
        {tab === "platform" ? <PlatformOwnerUsers /> : <StoreAdminUsers />}
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <StoreAdminUsers />;
}
