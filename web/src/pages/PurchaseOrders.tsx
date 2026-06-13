import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { PurchaseOrder, Supplier, Branch, Product, Category, POStatus } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import SearchableSelect from "@/components/SearchableSelect";
import IntegerInput from "@/components/IntegerInput";
import { formatDateInput, statusBadgeClass } from "@/lib/format";
import { formatProductLabel } from "@/lib/productUnits";
import { parseInteger } from "@/lib/integerInput";
import { api } from "@/lib/api";
import { callableErrorMessage } from "@/lib/callableError";

interface POItemForm {
  categoryId: string;
  productId: string;
  expectedQty: string;
}

interface POForm {
  supplierId: string;
  branchId: string;
  expectedDeliveryDate: string;
  notes: string;
  items: POItemForm[];
}

function emptyItem(): POItemForm {
  return { categoryId: "", productId: "", expectedQty: "" };
}

function emptyForm(): POForm {
  return {
    supplierId: "",
    branchId: "",
    expectedDeliveryDate: formatDateInput(),
    notes: "",
    items: [emptyItem()],
  };
}

export default function PurchaseOrders() {
  const { storeId } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<POForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    existingPurchaseOrderId: string;
    poNumber: string;
    status: POStatus;
    existingItemCount: number;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const MERGEABLE_STATUSES: POStatus[] = ["DRAFT", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"];

  const activeProducts = useMemo(
    () => products.filter((p) => p.status === "ACTIVE"),
    [products],
  );

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => !c.status || c.status === "ACTIVE")
        .map((c) => ({ value: c.id, label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );

  const findLocalDuplicate = () =>
    orders.find(
      (o) =>
        MERGEABLE_STATUSES.includes(o.status) &&
        o.supplierId === form.supplierId &&
        o.branchId === form.branchId &&
        o.expectedDeliveryDate === form.expectedDeliveryDate,
    );

  const validateForm = (): string | null => {
    if (!form.supplierId) return "Select a supplier.";
    if (!form.branchId) return "Select a branch.";
    if (!form.expectedDeliveryDate) return "Select an expected delivery date.";
    const activeItems = form.items.filter(
      (i) => i.categoryId || i.productId || i.expectedQty.trim(),
    );
    if (activeItems.length === 0) return "Add at least one product line.";
    for (const item of activeItems) {
      if (!item.categoryId) return "Select a category for each line item.";
      if (!item.productId) return "Select a product for each line item.";
      if (!item.expectedQty.trim()) return "Enter expected quantity for each line item.";
      if (parseInteger(item.expectedQty, 0) < 1) return "Quantity must be at least 1.";
    }
    return null;
  };

  useEffect(() => {
    if (!storeId) return;
    const u1 = onSnapshot(query(collection(db, "stores", storeId, "purchaseOrders"), orderBy("createdAt", "desc")), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseOrder));
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db, "stores", storeId, "suppliers"), (s) => setSuppliers(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier)));
    const u3 = onSnapshot(collection(db, "stores", storeId, "branches"), (s) => setBranches(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Branch)));
    const u4 = onSnapshot(collection(db, "stores", storeId, "products"), (s) => setProducts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)));
    const u5 = onSnapshot(collection(db, "stores", storeId, "categories"), (s) => setCategories(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Category)));
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [storeId]);

  const productsForCategory = (categoryId: string) =>
    activeProducts
      .filter((p) => p.categoryId === categoryId)
      .map((p) => ({ value: p.id, label: formatProductLabel(p) }))
      .sort((a, b) => a.label.localeCompare(b.label));

  const updateItem = (idx: number, patch: Partial<POItemForm>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }));
  };

  const openCreateModal = () => {
    setForm(emptyForm());
    setDuplicatePrompt(null);
    setSaveNotice(null);
    setSaveError(null);
    setModalOpen(true);
  };

  const buildLineItems = () =>
    form.items
      .filter((i) => i.productId)
      .map((i) => {
        const product = products.find((p) => p.id === i.productId);
        return {
          productId: i.productId,
          productName: product ? formatProductLabel(product) : "",
          expectedQty: Math.max(1, parseInteger(i.expectedQty, 1)),
        };
      });

  const closeCreateFlow = (message?: string) => {
    setModalOpen(false);
    setDuplicatePrompt(null);
    setSaveError(null);
    setForm(emptyForm());
    if (message) setSaveNotice(message);
  };

  const showDuplicatePrompt = (info: {
    existingPurchaseOrderId: string;
    poNumber: string;
    status: POStatus;
    existingItemCount: number;
  }) => {
    setSaveError(null);
    setModalOpen(false);
    setDuplicatePrompt(info);
  };

  const submitPurchaseOrder = async (options?: { allowDuplicate?: boolean; mergeIntoPurchaseOrderId?: string }) => {
    const validationError = validateForm();
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    const items = buildLineItems();
    if (items.length === 0) {
      setSaveError("Add at least one product line.");
      return;
    }

    if (!options?.allowDuplicate && !options?.mergeIntoPurchaseOrderId) {
      const localDup = findLocalDuplicate();
      if (localDup) {
        showDuplicatePrompt({
          existingPurchaseOrderId: localDup.id,
          poNumber: localDup.poNumber,
          status: localDup.status,
          existingItemCount: localDup.items.length,
        });
        return;
      }
    }

    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.createPurchaseOrder({
        branchId: form.branchId,
        supplierId: form.supplierId,
        expectedDeliveryDate: form.expectedDeliveryDate,
        notes: form.notes || undefined,
        items,
        status: "ORDERED",
        allowDuplicate: options?.allowDuplicate,
        mergeIntoPurchaseOrderId: options?.mergeIntoPurchaseOrderId,
      });
      const data = result.data as {
        duplicate?: boolean;
        merged?: boolean;
        existingPurchaseOrderId?: string;
        poNumber?: string;
        status?: string;
        existingItemCount?: number;
        purchaseOrderId?: string;
        itemCount?: number;
      };

      if (data.duplicate && data.existingPurchaseOrderId && data.poNumber) {
        showDuplicatePrompt({
          existingPurchaseOrderId: data.existingPurchaseOrderId,
          poNumber: data.poNumber,
          status: (data.status as POStatus) ?? "ORDERED",
          existingItemCount: data.existingItemCount ?? 0,
        });
        return;
      }

      if (data.purchaseOrderId && data.poNumber) {
        closeCreateFlow(
          data.merged
            ? `Items added to ${data.poNumber} (${data.itemCount ?? items.length} line items total).`
            : `Purchase order ${data.poNumber} created.`,
        );
        return;
      }

      setSaveError("Unexpected response from server. Deploy the latest Cloud Functions and try again.");
    } catch (err) {
      setSaveError(callableErrorMessage(err, "Failed to save purchase order"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPurchaseOrder();
  };

  const handleMergeIntoExisting = async () => {
    if (!duplicatePrompt) return;
    await submitPurchaseOrder({ mergeIntoPurchaseOrderId: duplicatePrompt.existingPurchaseOrderId });
  };

  const handleCreateSeparate = async () => {
    await submitPurchaseOrder({ allowDuplicate: true });
  };

  const updateStatus = async (id: string, status: POStatus) => {
    await api.updatePurchaseOrderStatus({ purchaseOrderId: id, status });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Purchase Orders" actions={<button onClick={openCreateModal} className="btn-primary"><Plus size={18} /> Create PO</button>} />
      {saveNotice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {saveNotice}
        </div>
      )}
      <DataTable data={orders} keyField="id" columns={[
        { key: "po", header: "PO Number", sortValue: (o) => o.poNumber, render: (o) => <span className="font-medium">{o.poNumber}</span> },
        { key: "supplier", header: "Supplier", sortValue: (o) => suppliers.find((s) => s.id === o.supplierId)?.name ?? "", render: (o) => suppliers.find((s) => s.id === o.supplierId)?.name ?? "-" },
        { key: "branch", header: "Branch", sortValue: (o) => branches.find((b) => b.id === o.branchId)?.name ?? "", render: (o) => branches.find((b) => b.id === o.branchId)?.name ?? "-" },
        { key: "date", header: "Expected Delivery", sortValue: (o) => o.expectedDeliveryDate, render: (o) => o.expectedDeliveryDate },
        { key: "items", header: "Items", sortValue: (o) => o.items.length, render: (o) => o.items.length },
        { key: "status", header: "Status", sortValue: (o) => o.status, render: (o) => <span className={statusBadgeClass(o.status)}>{o.status}</span> },
        { key: "actions", header: "", sortable: false, render: (o) => (
          <div className="flex gap-2">
            <Link to={`/deliveries/${o.id}`} className="text-brand-600 text-sm hover:underline">Receive</Link>
            {o.status === "DRAFT" && <button onClick={() => updateStatus(o.id, "ORDERED")} className="text-sm text-slate-600 hover:underline">Order</button>}
            {o.status === "ORDERED" && <button onClick={() => updateStatus(o.id, "IN_TRANSIT")} className="text-sm text-slate-600 hover:underline">In Transit</button>}
          </div>
        )},
      ]} />
      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title="Create Purchase Order" wide>
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Supplier *</label>
              <select className="input-field" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">Select...</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Branch *</label>
              <select className="input-field" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">Select...</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Expected Delivery *</label>
            <input type="date" className="input-field" value={form.expectedDeliveryDate} onChange={(e) => setForm({ ...form, expectedDeliveryDate: e.target.value })} />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Line items</p>
            {form.items.map((item, idx) => {
              const productOptions = item.categoryId ? productsForCategory(item.categoryId) : [];
              return (
                <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <SearchableSelect
                      label="Category *"
                      value={item.categoryId}
                      onChange={(categoryId) => updateItem(idx, { categoryId, productId: "" })}
                      options={categoryOptions}
                      placeholder="Select category..."
                      searchPlaceholder="Search categories..."
                      emptyMessage="No categories found"
                    />
                    <SearchableSelect
                      label="Product *"
                      value={item.productId}
                      onChange={(productId) => updateItem(idx, { productId })}
                      options={productOptions}
                      placeholder={item.categoryId ? "Select product..." : "Pick a category first"}
                      searchPlaceholder="Search products..."
                      disabled={!item.categoryId}
                      emptyMessage={item.categoryId ? "No products in this category" : "Select a category first"}
                    />
                    <IntegerInput
                      label="Expected qty *"
                      value={item.expectedQty}
                      onChange={(expectedQty) => updateItem(idx, { expectedQty })}
                      placeholder="e.g. 24"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}
            className="text-sm text-brand-600 hover:underline"
          >
            + Add item
          </button>

          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving..." : "Save PO"}</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!duplicatePrompt}
        onClose={() => !saving && setDuplicatePrompt(null)}
        title="Existing purchase order found"
      >
        {duplicatePrompt && (
          <div className="space-y-4">
            {saveError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveError}
              </div>
            )}
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{duplicatePrompt.poNumber}</span> already exists for{" "}
              <span className="font-medium text-slate-900">
                {suppliers.find((s) => s.id === form.supplierId)?.name ?? "this supplier"}
              </span>{" "}
              on{" "}
              <span className="font-medium text-slate-900">{form.expectedDeliveryDate}</span>{" "}
              ({branches.find((b) => b.id === form.branchId)?.name ?? "branch"} · {duplicatePrompt.status.replace(/_/g, " ").toLowerCase()} ·{" "}
              {duplicatePrompt.existingItemCount} item{duplicatePrompt.existingItemCount !== 1 ? "s" : ""}).
            </p>
            <p className="text-sm text-slate-600">
              Add your new line items to that PO (quantities combine for the same product), or create a separate PO anyway.
              A different delivery date always creates a new PO.
            </p>
            <div className="form-actions">
              <button type="button" onClick={() => { setSaveError(null); setDuplicatePrompt(null); setModalOpen(true); }} className="btn-secondary" disabled={saving}>
                Go back
              </button>
              <button type="button" onClick={handleCreateSeparate} className="btn-secondary" disabled={saving}>
                Create separate PO
              </button>
              <button type="button" onClick={handleMergeIntoExisting} className="btn-primary" disabled={saving}>
                {saving ? "Updating..." : "Add to existing PO"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
