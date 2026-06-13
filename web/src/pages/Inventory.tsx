import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, getDoc, doc } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BranchInventory, Product, StockMovement, Category } from "@stockmate/types";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import Modal from "@/components/Modal";
import LoadingSpinner from "@/components/LoadingSpinner";
import BranchFilter from "@/components/BranchFilter";
import IntegerInput from "@/components/IntegerInput";
import { api } from "@/lib/api";
import { parseSignedInteger } from "@/lib/integerInput";
import { branchScopedQuery, isStoreWideAccess } from "@/lib/branchScope";
import { statusBadgeClass, stockStatus } from "@/lib/format";
import { formatProductLabel, formatProductMeasure, productSearchText } from "@/lib/productUnits";
import { branchName, useBranches } from "@/lib/useBranches";

function inventoryRowSearchText(
  item: BranchInventory & { product?: Product },
  branchLabel: string,
  categoryName: string,
): string {
  const status = stockStatus(item.currentStock, item.reorderLevel, item.criticalLevel);
  return [
    branchLabel,
    categoryName,
    item.product ? productSearchText(item.product) : item.productId,
    item.product ? formatProductLabel(item.product) : "",
    item.product ? formatProductMeasure(item.product) : "",
    item.product?.unit,
    item.product?.unitSize != null ? String(item.product.unitSize) : "",
    status.label,
    String(item.currentStock),
    String(item.reorderLevel),
    String(item.criticalLevel),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function Inventory() {
  const { storeId, user } = useAuth();
  const { branches } = useBranches(storeId);
  const [inventory, setInventory] = useState<(BranchInventory & { product?: Product })[]>([]);
  const [categories, setCategories] = useState<Map<string, string>>(new Map());
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [filter, setFilter] = useState<"all" | "low" | "critical">("all");
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [adjModal, setAdjModal] = useState(false);
  const [adjForm, setAdjForm] = useState({ productId: "", quantityChange: "", reason: "" });
  const [loading, setLoading] = useState(true);

  const showBranchColumn = user ? isStoreWideAccess(user) : false;
  const effectiveBranchId = user && !isStoreWideAccess(user) ? user.branchId : branchFilter;

  useEffect(() => {
    if (!storeId || !user) return;
    const u1 = onSnapshot(
      branchScopedQuery(collection(db, "stores", storeId, "branchInventory"), user),
      async (snap) => {
        const inv = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BranchInventory);
        const productsSnap = await Promise.all(
          inv.map((i) => getDoc(doc(db, "stores", storeId, "products", i.productId))),
        );
        setInventory(
          inv.map((i, idx) => {
            const ps = productsSnap[idx];
            return {
              ...i,
              product: ps.exists() ? ({ id: ps.id, ...ps.data() } as Product) : undefined,
            };
          }),
        );
        setLoading(false);
      },
    );
    const u2 = onSnapshot(
      branchScopedQuery(collection(db, "stores", storeId, "stockMovements"), user, orderBy("createdAt", "desc")),
      (snap) => setMovements(snap.docs.slice(0, 20).map((d) => ({ id: d.id, ...d.data() }) as StockMovement)),
    );
    const u3 = onSnapshot(collection(db, "stores", storeId, "categories"), (snap) => {
      const map = new Map<string, string>();
      snap.docs.forEach((d) => map.set(d.id, (d.data() as Category).name));
      setCategories(map);
    });
    return () => {
      u1();
      u2();
      u3();
    };
  }, [storeId, user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory.filter((i) => {
      if (effectiveBranchId && i.branchId !== effectiveBranchId) return false;
      if (q) {
        const categoryName = i.product?.categoryId ? (categories.get(i.product.categoryId) ?? "") : "";
        const haystack = inventoryRowSearchText(i, branchName(branches, i.branchId), categoryName);
        if (!haystack.includes(q)) return false;
      }
      if (filter === "critical") return i.currentStock <= i.criticalLevel;
      if (filter === "low") return i.currentStock <= i.reorderLevel && i.currentStock > i.criticalLevel;
      return true;
    });
  }, [inventory, effectiveBranchId, search, filter, branches, categories]);

  const adjustmentBranchId = effectiveBranchId || user?.branchId || "";
  const adjustmentProducts = inventory.filter((i) => !effectiveBranchId || i.branchId === effectiveBranchId);

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !adjustmentBranchId) return;
    await api.createStockAdjustment({
      branchId: adjustmentBranchId,
      productId: adjForm.productId,
      quantityChange: parseSignedInteger(adjForm.quantityChange, 0),
      reason: adjForm.reason,
    });
    setAdjModal(false);
  };

  if (loading || !user) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels are tracked per branch. Each branch has its own quantity, reorder level, and critical level."
        actions={
          <button onClick={() => setAdjModal(true)} className="btn-secondary" disabled={!adjustmentBranchId}>
            Request Adjustment
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-scroll w-full sm:w-auto">
          {(["all", "low", "critical"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={filter === f ? "btn-primary" : "btn-secondary"}>
              {f === "all" ? "All Stock" : f === "low" ? "Low Stock" : "Critical"}
            </button>
          ))}
        </div>
        <BranchFilter
          branches={branches}
          user={user}
          value={branchFilter}
          onChange={setBranchFilter}
          className="w-full sm:max-w-xs"
        />
        <input
          className="input-field w-full sm:ml-auto sm:w-72"
          placeholder="Search branch, category, product, size..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        data={filtered}
        keyField="id"
        columns={[
          ...(showBranchColumn
            ? [
                {
                  key: "branch",
                  header: "Branch",
                  sortValue: (i: BranchInventory & { product?: Product }) => branchName(branches, i.branchId),
                  render: (i: BranchInventory & { product?: Product }) => (
                    <span className="font-medium text-slate-700">{branchName(branches, i.branchId)}</span>
                  ),
                },
              ]
            : []),
          {
            key: "name",
            header: "Product",
            sortValue: (i) => (i.product ? formatProductLabel(i.product) : i.productId),
            render: (i) => (
              <span className="font-medium">
                {i.product ? formatProductLabel(i.product) : i.productId}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            sortValue: (i) => stockStatus(i.currentStock, i.reorderLevel, i.criticalLevel).label,
            render: (i) => {
              const s = stockStatus(i.currentStock, i.reorderLevel, i.criticalLevel);
              return <span className={statusBadgeClass(s.badge)}>{s.label}</span>;
            },
          },
          {
            key: "stock",
            header: "Current Stock",
            sortValue: (i) => i.currentStock,
            render: (i) => (
              <span className={i.currentStock <= i.criticalLevel ? "font-semibold text-red-600" : "font-medium"}>
                {i.currentStock}
              </span>
            ),
          },
          { key: "reorder", header: "Reorder Level", sortValue: (i) => i.reorderLevel, render: (i) => i.reorderLevel },
          { key: "critical", header: "Critical Level", sortValue: (i) => i.criticalLevel, render: (i) => i.criticalLevel },
        ]}
      />

      <h2 className="mb-4 mt-8 text-lg font-semibold text-slate-900">Recent Stock Movements</h2>
      <DataTable
        data={movements.filter((m) => !effectiveBranchId || m.branchId === effectiveBranchId)}
        keyField="id"
        emptyMessage="No movements yet"
        columns={[
          ...(showBranchColumn
            ? [{ key: "branch", header: "Branch", sortValue: (m: StockMovement) => branchName(branches, m.branchId), render: (m: StockMovement) => branchName(branches, m.branchId) }]
            : []),
          { key: "type", header: "Type", sortValue: (m) => m.type, render: (m) => m.type },
          { key: "product", header: "Product", sortValue: (m) => m.productName ?? m.productId, render: (m) => m.productName ?? m.productId },
          {
            key: "change",
            header: "Change",
            sortValue: (m) => m.quantityChange,
            render: (m) => (
              <span className={m.quantityChange > 0 ? "text-green-600" : "text-red-600"}>
                {m.quantityChange > 0 ? "+" : ""}
                {m.quantityChange}
              </span>
            ),
          },
          { key: "stock", header: "New Stock", sortValue: (m) => m.newStock, render: (m) => m.newStock },
          { key: "date", header: "Date", sortValue: (m) => m.createdAt, render: (m) => new Date(m.createdAt).toLocaleString() },
        ]}
      />

      <Modal open={adjModal} onClose={() => setAdjModal(false)} title="Stock Adjustment Request">
        <form onSubmit={handleAdjustment} className="space-y-4">
          {showBranchColumn && (
            <p className="text-sm text-slate-500">
              Branch: <strong>{branchName(branches, adjustmentBranchId)}</strong>
              {!branchFilter && " — select a branch in the filter above first"}
            </p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Product</label>
            <select
              className="input-field"
              required
              value={adjForm.productId}
              onChange={(e) => setAdjForm({ ...adjForm, productId: e.target.value })}
            >
              <option value="">Select...</option>
              {adjustmentProducts.map((i) => (
                <option key={i.id} value={i.productId}>
                  {i.product ? formatProductLabel(i.product) : i.productId}
                  {showBranchColumn ? ` (${branchName(branches, i.branchId)})` : ""}
                </option>
              ))}
            </select>
          </div>
          <IntegerInput
            label="Quantity Change (+/-)"
            value={adjForm.quantityChange}
            onChange={(quantityChange) => setAdjForm({ ...adjForm, quantityChange })}
            placeholder="e.g. 10 or -5"
            allowNegative
            required
          />
          <div>
            <label className="mb-1 block text-sm font-medium">Reason</label>
            <input
              className="input-field"
              required
              value={adjForm.reason}
              onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => setAdjModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!adjustmentBranchId}>
              Submit
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
