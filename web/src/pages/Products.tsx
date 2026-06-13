import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { Plus, Search, Barcode } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Product, Category, EntityStatus, BranchInventory, Branch } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import BranchFilter from "@/components/BranchFilter";
import { formatCurrency, statusBadgeClass, stockStatus } from "@/lib/format";
import {
  formatOneDecimalForInput,
  parseOneDecimal,
  sanitizeOneDecimalInput,
} from "@/lib/moneyInput";
import { parseInteger, sanitizeIntegerInput } from "@/lib/integerInput";
import {
  MEASURE_UNITS,
  defaultStockUnit,
  formatProductMeasure,
  isCountUnit,
  unitShort,
} from "@/lib/productUnits";
import { canViewSupplierCost, isStoreAdmin } from "@/lib/permissions";
import { isStoreWideAccess } from "@/lib/branchScope";
import { branchName, useBranches } from "@/lib/useBranches";
import { api } from "@/lib/api";
import { callableErrorMessage } from "@/lib/callableError";

interface ProductForm {
  name: string;
  categoryId: string;
  unit: string;
  unitSize: string;
  sellingPrice: string;
  supplierCost: string;
  reorderLevel: string;
  criticalLevel: string;
  barcode: string;
  sku: string;
  brand: string;
  status: EntityStatus;
  branchId: string;
  initialStock: string;
}

function emptyForm(defaultBranchId = ""): ProductForm {
  return {
    name: "",
    categoryId: "",
    unit: "g",
    unitSize: "",
    sellingPrice: "",
    supplierCost: "",
    reorderLevel: "10",
    criticalLevel: "5",
    barcode: "",
    sku: "",
    brand: "",
    status: "ACTIVE",
    branchId: defaultBranchId,
    initialStock: "",
  };
}

function parseInitialStockInput(value: string, stockUnit: string): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (isCountUnit(stockUnit)) return Math.floor(n);
  return Math.round(n * 10) / 10;
}

function productBranchLabel(product: Product, inventory: BranchInventory[], branches: Branch[]): string {
  const primaryId = product.primaryBranchId;
  if (primaryId) {
    const name = branchName(branches, primaryId);
    const otherBranches = inventory.filter(
      (i) => i.productId === product.id && i.branchId !== primaryId && i.currentStock > 0,
    ).length;
    if (otherBranches > 0) {
      return `${name} (+${otherBranches})`;
    }
    return name;
  }

  const withStock = inventory.filter((i) => i.productId === product.id && i.currentStock > 0);
  if (withStock.length === 1) {
    return branchName(branches, withStock[0].branchId);
  }
  if (withStock.length > 1) {
    return `${withStock.length} branches`;
  }
  return "Not assigned";
}

export default function Products() {
  const { storeId, user } = useAuth();
  const [searchParams] = useSearchParams();
  const { branches } = useBranches(storeId);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ACTIVE" | "INACTIVE" | "all">("ACTIVE");
  const [branchFilter, setBranchFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const showBranchStock = user ? isStoreWideAccess(user) : false;
  const stockBranchId = branchFilter || (user && !isStoreWideAccess(user) ? user.branchId : "");
  const defaultBranchId = user?.branchId || branches[0]?.id || "";

  useEffect(() => {
    const q = searchParams.get("search");
    if (q) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    if (showBranchStock && branches.length > 0 && !branchFilter) {
      setBranchFilter(branches[0].id);
    }
  }, [showBranchStock, branches, branchFilter]);

  useEffect(() => {
    if (!storeId) return;
    const u1 = onSnapshot(query(collection(db, "stores", storeId, "products"), orderBy("name")), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product));
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db, "stores", storeId, "categories"), (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category));
    });
    const u3 = onSnapshot(collection(db, "stores", storeId, "branchInventory"), (snap) => {
      setInventory(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BranchInventory));
    });
    return () => {
      u1();
      u2();
      u3();
    };
  }, [storeId]);

  const stockByProduct = useMemo(() => {
    const map = new Map<string, BranchInventory>();
    for (const row of inventory) {
      if (stockBranchId && row.branchId !== stockBranchId) continue;
      map.set(row.productId, row);
    }
    return map;
  }, [inventory, stockBranchId]);

  const filtered = products.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search) ||
      p.internalBarcode?.includes(search) ||
      p.sku?.includes(search);
    const matchCat = !filterCat || p.categoryId === filterCat;
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchCat && matchStatus;
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(defaultBranchId));
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      categoryId: p.categoryId,
      unit: p.unit,
      unitSize: p.unitSize != null && p.unitSize > 0 ? String(p.unitSize) : "",
      sellingPrice: formatOneDecimalForInput(p.sellingPrice),
      supplierCost: formatOneDecimalForInput(p.supplierCost),
      reorderLevel: String(p.reorderLevel),
      criticalLevel: String(p.criticalLevel),
      barcode: p.barcode ?? "",
      sku: p.sku ?? "",
      brand: p.brand ?? "",
      status: p.status,
      branchId: p.primaryBranchId ?? "",
      initialStock: "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;

    const sellingPrice = parseOneDecimal(form.sellingPrice);
    if (sellingPrice == null) {
      setFormError("Enter a valid selling price with at most one decimal (e.g. 99.5)");
      return;
    }

    const supplierCostParsed = form.supplierCost.trim() ? parseOneDecimal(form.supplierCost) : null;
    if (form.supplierCost.trim() && supplierCostParsed == null) {
      setFormError("Supplier cost must have at most one decimal (e.g. 45.0)");
      return;
    }

    if (!editing && !form.branchId) {
      setFormError("Select the branch where this product is located");
      return;
    }

    const unitSizeParsed = form.unitSize.trim() ? parseFloat(form.unitSize) : undefined;
    if (form.unitSize.trim() && (unitSizeParsed == null || unitSizeParsed <= 0)) {
      setFormError("Size per item must be a positive number (e.g. 400 for 400 g)");
      return;
    }

    const stockUnit = defaultStockUnit(form.unit, form.unitSize);
    const initialStock = parseInitialStockInput(form.initialStock, stockUnit);

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        unit: form.unit,
        unitSize: unitSizeParsed,
        stockUnit,
        sellingPrice,
        supplierCost: supplierCostParsed ?? undefined,
        reorderLevel: parseInteger(form.reorderLevel, 10),
        criticalLevel: parseInteger(form.criticalLevel, 5),
        barcode: form.barcode.trim() || undefined,
        sku: form.sku.trim() || undefined,
        brand: form.brand.trim() || undefined,
        status: form.status,
      };

      if (editing) {
        await api.updateProduct({
          productId: editing.id,
          ...payload,
        });
        if (Math.round(editing.sellingPrice * 10) !== Math.round(sellingPrice * 10)) {
          await api.changeProductPrice({ productId: editing.id, newPrice: sellingPrice });
        }
      } else {
        await api.createProduct({
          ...payload,
          branchId: form.branchId,
          initialStock,
        });
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateBarcode = async (productId: string) => {
    try {
      const result = await api.generateInternalBarcode({ productId });
      alert(`Internal barcode: ${(result.data as { internalBarcode: string }).internalBarcode}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const toggleArchive = async (product: Product) => {
    const archiving = product.status === "ACTIVE";
    const label = archiving ? "Archive" : "Restore";
    if (
      !confirm(
        archiving
          ? `Archive "${product.name}"? It will be removed from POS. Sales history is kept.`
          : `Restore "${product.name}" to active? It will appear in POS again.`,
      )
    ) {
      return;
    }
    try {
      await api.updateProduct({
        productId: product.id,
        status: archiving ? "INACTIVE" : "ACTIVE",
      });
    } catch (err) {
      alert(callableErrorMessage(err, `Failed to ${label.toLowerCase()} product`));
    }
  };

  const showCost = user && canViewSupplierCost(user);
  const isAdmin = user && isStoreAdmin(user);

  if (loading || !user) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Products"
        description="The product catalog is shared across your store. Archive products you no longer sell — they stay in reports but are hidden from POS."
        actions={
          isAdmin ? (
            <button onClick={openCreate} className="btn-primary">
              <Plus size={18} /> Add Product
            </button>
          ) : undefined
        }
      />

      <div className="filter-bar">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="input-field pl-10"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field w-auto" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="input-field w-auto"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "ACTIVE" | "INACTIVE" | "all")}
        >
          <option value="ACTIVE">Active only</option>
          <option value="INACTIVE">Archived only</option>
          <option value="all">All products</option>
        </select>
        {showBranchStock && (
          <BranchFilter
            branches={branches}
            user={user}
            value={branchFilter}
            onChange={setBranchFilter}
            showAllOption={false}
          />
        )}
      </div>

      <DataTable
        data={filtered}
        keyField="id"
        defaultSortKey="name"
        columns={[
          {
            key: "name",
            header: "Product",
            sortValue: (p) => p.name,
            render: (p) => <span className="font-medium">{p.name}</span>,
          },
          {
            key: "located",
            header: "Location",
            sortValue: (p) => productBranchLabel(p, inventory, branches),
            render: (p) => (
              <span className="text-sm text-slate-700">{productBranchLabel(p, inventory, branches)}</span>
            ),
          },
          {
            key: "category",
            header: "Category",
            sortValue: (p) => categories.find((c) => c.id === p.categoryId)?.name ?? "",
            render: (p) => categories.find((c) => c.id === p.categoryId)?.name ?? "-",
          },
          {
            key: "unit",
            header: "Unit / size",
            sortValue: (p) => formatProductMeasure(p),
            render: (p) => formatProductMeasure(p),
          },
          {
            key: "barcode",
            header: "Barcode",
            sortValue: (p) => p.barcode ?? p.internalBarcode ?? "",
            render: (p) =>
              p.barcode || p.internalBarcode ? (
                <span className="font-mono text-xs">{p.barcode ?? p.internalBarcode}</span>
              ) : (
                <span className={statusBadgeClass("PENDING")}>Needs scan</span>
              ),
          },
          ...(stockBranchId
            ? [
                {
                  key: "branchStock",
                  header: "Stock",
                  sortValue: (p: Product) => stockByProduct.get(p.id)?.currentStock ?? 0,
                  render: (p: Product) => {
                    const inv = stockByProduct.get(p.id);
                    const qty = inv?.currentStock ?? 0;
                    if (!inv) {
                      return <span className="font-medium text-slate-400">0</span>;
                    }
                    const s = stockStatus(inv.currentStock, inv.reorderLevel, inv.criticalLevel);
                    return (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-medium tabular-nums">{qty}</span>
                        <span className={statusBadgeClass(s.badge)}>{s.label}</span>
                      </span>
                    );
                  },
                },
              ]
            : []),
          {
            key: "price",
            header: "Selling Price",
            sortValue: (p) => p.sellingPrice,
            render: (p) => formatCurrency(p.sellingPrice),
          },
          ...(showCost
            ? [
                {
                  key: "cost",
                  header: "Supplier Cost",
                  sortValue: (p: Product) => p.supplierCost ?? 0,
                  render: (p: Product) => (p.supplierCost != null ? formatCurrency(p.supplierCost) : "-"),
                },
              ]
            : []),
          {
            key: "status",
            header: "Status",
            sortValue: (p) => p.status,
            render: (p) => <span className={statusBadgeClass(p.status)}>{p.status}</span>,
          },
          ...(isAdmin
            ? [
                {
                  key: "actions",
                  header: "",
                  sortable: false,
                  render: (p: Product) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => openEdit(p)} className="text-sm text-brand-600 hover:underline">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleArchive(p)}
                        className={`text-sm hover:underline ${
                          p.status === "ACTIVE" ? "text-slate-500 hover:text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {p.status === "ACTIVE" ? "Archive" : "Restore"}
                      </button>
                      {p.status === "ACTIVE" && (
                        <button
                          onClick={() => handleGenerateBarcode(p.id)}
                          className="text-slate-500 hover:text-brand-600"
                          title="Generate internal barcode"
                        >
                          <Barcode size={16} />
                        </button>
                      )}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />

      {isAdmin && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Product" : "Add Product"} wide>
          <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
                {formError}
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">Product Name *</label>
              <input
                className="input-field"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {!editing ? (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">Location *</label>
                <select
                  className="input-field max-w-md"
                  required
                  value={form.branchId}
                  onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                >
                  <option value="">Select branch...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Where this product is physically stored now.</p>
              </div>
            ) : (
              <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span className="font-medium">Location: </span>
                {form.branchId ? branchName(branches, form.branchId) : "Not set"}
                <span className="text-slate-500"> — branch location is set when the product is created.</span>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">Category *</label>
              <select
                className="input-field"
                required
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Select...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Measure unit *</label>
              <select
                className="input-field"
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {MEASURE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">What one item contains (e.g. grams, liters).</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Size per item</label>
              <input
                type="text"
                inputMode="decimal"
                className="input-field"
                value={form.unitSize}
                placeholder={form.unit === "pcs" ? "Optional" : "e.g. 400"}
                onChange={(e) =>
                  setForm({ ...form, unitSize: sanitizeOneDecimalInput(e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                {form.unitSize && parseFloat(form.unitSize) > 0
                  ? `Each item is ${form.unitSize} ${unitShort(form.unit)}`
                  : "Leave empty if sold by the measure unit itself."}
              </p>
            </div>

            {!editing && (
              <div>
                <label className="mb-1 block text-sm font-medium">Stock</label>
                <input
                  type="text"
                  inputMode={isCountUnit(defaultStockUnit(form.unit, form.unitSize)) ? "numeric" : "decimal"}
                  className="input-field"
                  value={form.initialStock}
                  onChange={(e) => {
                    const su = defaultStockUnit(form.unit, form.unitSize);
                    const v = isCountUnit(su)
                      ? sanitizeIntegerInput(e.target.value)
                      : sanitizeOneDecimalInput(e.target.value);
                    setForm({ ...form, initialStock: v });
                  }}
                  placeholder="0"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Starting quantity at the selected branch. Other branches start at 0.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">Selling Price *</label>
              <input
                type="text"
                inputMode="decimal"
                className="input-field"
                required
                value={form.sellingPrice}
                placeholder="0.0"
                onChange={(e) => setForm({ ...form, sellingPrice: sanitizeOneDecimalInput(e.target.value) })}
              />
              <p className="mt-1 text-xs text-slate-500">One decimal place only (e.g. 99.5)</p>
            </div>

            {showCost && (
              <div>
                <label className="mb-1 block text-sm font-medium">Supplier Cost</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-field"
                  value={form.supplierCost}
                  placeholder="0.0"
                  onChange={(e) => setForm({ ...form, supplierCost: sanitizeOneDecimalInput(e.target.value) })}
                />
                <p className="mt-1 text-xs text-slate-500">One decimal place only (e.g. 45.0)</p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">Reorder Level</label>
              <input
                type="text"
                inputMode="numeric"
                min={0}
                className="input-field"
                placeholder="10"
                value={form.reorderLevel}
                onChange={(e) => setForm({ ...form, reorderLevel: sanitizeIntegerInput(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Critical Level</label>
              <input
                type="text"
                inputMode="numeric"
                min={0}
                className="input-field"
                placeholder="5"
                value={form.criticalLevel}
                onChange={(e) => setForm({ ...form, criticalLevel: sanitizeIntegerInput(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Barcode (optional)</label>
              <input
                className="input-field"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="Leave empty for Android scan"
              />
              <p className="mt-1 text-xs text-slate-500">Cashiers can assign this later via the Android app.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">SKU</label>
              <input className="input-field" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>

            {editing && (
              <div>
                <label className="mb-1 block text-sm font-medium">Status</label>
                <select
                  className="input-field"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as EntityStatus })}
                >
                  <option value="ACTIVE">Active — visible in POS</option>
                  <option value="INACTIVE">Archived — hidden from POS</option>
                </select>
              </div>
            )}

            <div className="form-actions pt-2 sm:col-span-2">
              <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
