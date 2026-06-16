import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  MessageSquare,
  PackagePlus,
  Plus,
  ShieldAlert,
  ShoppingCart,
} from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { branchScopedQuery, isStoreWideAccess } from "@/lib/branchScope";
import {
  canApproveAdjustment,
  canCreatePurchaseRequest,
  canRequestPermissions,
  hasRequestablePermission,
  isManagerOrAbove,
  isStoreAdmin,
  REQUESTABLE_PERMISSIONS,
} from "@/lib/permissions";
import { api } from "@/lib/api";
import { callableErrorMessage } from "@/lib/callableError";
import { formatDate, statusBadgeClass } from "@/lib/format";
import { formatProductLabel } from "@/lib/productUnits";
import { parseInteger } from "@/lib/integerInput";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/SearchableSelect";
import IntegerInput from "@/components/IntegerInput";
import type {
  Branch,
  Category,
  PermissionRequest,
  Product,
  PurchaseRequest,
  PurchaseRequestType,
  RequestablePermission,
  SaleVoidRequest,
  StockAdjustment,
  Supplier,
  Thread,
  User,
} from "@stockmate/types";
import {
  REQUEST_TYPE_META,
  REQUEST_TYPE_OPTIONS,
  requestMeta,
  requestTitle,
} from "@/lib/purchaseRequests";

function SectionCard({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="card animate-slide-up">
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
        {icon}
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

interface RequestForm {
  requestType: PurchaseRequestType;
  categoryId: string;
  productId: string;
  subject: string;
  qty: string;
  description: string;
}

const emptyRequestForm = (): RequestForm => ({
  requestType: "PRODUCT_REORDER",
  categoryId: "",
  productId: "",
  subject: "",
  qty: "",
  description: "",
});

const permLabel = (key: RequestablePermission) =>
  REQUESTABLE_PERMISSIONS.find((p) => p.key === key)?.label ?? key;

const permDescription = (key: RequestablePermission) =>
  REQUESTABLE_PERMISSIONS.find((p) => p.key === key)?.description ?? "";

export default function Activity() {
  const { storeId, user } = useAuth();
  const navigate = useNavigate();
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<PurchaseRequest[]>([]);
  const [myRequests, setMyRequests] = useState<PurchaseRequest[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [voidRequests, setVoidRequests] = useState<SaleVoidRequest[]>([]);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [myPermissionRequests, setMyPermissionRequests] = useState<PermissionRequest[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [branches, setBranches] = useState<Record<string, Branch>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm());
  const [savingRequest, setSavingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permForm, setPermForm] = useState<{ permission: RequestablePermission; reason: string }>({
    permission: "canChangePrice",
    reason: "",
  });
  const [savingPerm, setSavingPerm] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);

  const uid = user?.id ?? "";

  useEffect(() => {
    if (!storeId || !user) return;
    const base = (name: string) => collection(db, "stores", storeId, name);

    const unsubs = [
      onSnapshot(
        branchScopedQuery(base("purchaseRequests"), user, where("status", "==", "PENDING")),
        (snap) => {
          setPurchaseRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseRequest));
          setLoading(false);
        },
        () => setLoading(false),
      ),
      onSnapshot(
        branchScopedQuery(base("purchaseRequests"), user, where("status", "==", "APPROVED")),
        (snap) => setApprovedRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseRequest)),
        () => undefined,
      ),
      onSnapshot(
        query(base("purchaseRequests"), where("requestedBy", "==", user.id), orderBy("createdAt", "desc"), limit(20)),
        (snap) => {
          const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseRequest);
          const scoped = isStoreWideAccess(user)
            ? all
            : all.filter((r) => r.branchId === user.branchId);
          setMyRequests(scoped.slice(0, 8));
        },
        () => undefined,
      ),
      onSnapshot(
        branchScopedQuery(base("stockAdjustments"), user, where("status", "==", "PENDING")),
        (snap) => setAdjustments(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StockAdjustment)),
      ),
      onSnapshot(
        branchScopedQuery(base("saleVoidRequests"), user, where("status", "==", "PENDING")),
        (snap) => setVoidRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SaleVoidRequest)),
      ),
      onSnapshot(
        isStoreAdmin(user)
          ? query(base("threads"), orderBy("lastMessageAt", "desc"), limit(20))
          : query(
              base("threads"),
              where("branchId", "==", user.branchId),
              orderBy("lastMessageAt", "desc"),
              limit(20),
            ),
        (snap) => setThreads(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Thread)),
        () => undefined,
      ),
      onSnapshot(base("users"), (snap) => {
        const map: Record<string, User> = {};
        snap.docs.forEach((d) => (map[d.id] = { id: d.id, ...d.data() } as User));
        setUsers(map);
      }),
      onSnapshot(base("branches"), (snap) => {
        const map: Record<string, Branch> = {};
        snap.docs.forEach((d) => (map[d.id] = { id: d.id, ...d.data() } as Branch));
        setBranches(map);
      }),
      onSnapshot(base("products"), (snap) =>
        setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)),
      ),
      onSnapshot(base("categories"), (snap) =>
        setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category)),
      ),
      onSnapshot(base("suppliers"), (snap) =>
        setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier)),
      ),
    ];

    if (isStoreAdmin(user)) {
      unsubs.push(
        onSnapshot(
          query(base("permissionRequests"), where("status", "==", "PENDING")),
          (snap) => setPermissionRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PermissionRequest)),
          () => undefined,
        ),
      );
    } else {
      unsubs.push(
        onSnapshot(
          query(base("permissionRequests"), where("requestedBy", "==", user.id)),
          (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PermissionRequest);
            rows.sort((a, b) => b.createdAt - a.createdAt);
            setMyPermissionRequests(rows);
          },
          () => undefined,
        ),
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [storeId, user]);

  const userName = (id?: string) => (id && users[id]?.fullName) || "Staff";
  const branchName = (id?: string) => (id && branches[id]?.name) || "—";

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => !c.status || c.status === "ACTIVE")
        .map((c) => ({ value: c.id, label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );

  const productsForCategory = (categoryId: string) =>
    products
      .filter((p) => p.status === "ACTIVE" && p.categoryId === categoryId)
      .map((p) => ({ value: p.id, label: formatProductLabel(p) }))
      .sort((a, b) => a.label.localeCompare(b.label));

  // Match what the user is typing against existing categories / suppliers so we
  // can warn about duplicates before a request is filed. Categories and
  // suppliers must be unique; products are allowed (they vary by unit/size).
  const existingMatches = useMemo(() => {
    const type = requestForm.requestType;
    const q = requestForm.subject.trim().toLowerCase();
    const blocking = type === "NEW_CATEGORY" || type === "NEW_SUPPLIER";
    if (!q || (type !== "NEW_CATEGORY" && type !== "NEW_SUPPLIER" && type !== "NEW_PRODUCT")) {
      return { exact: null as string | null, matches: [] as string[], blocking };
    }
    const names =
      type === "NEW_CATEGORY"
        ? categories.filter((c) => !c.status || c.status === "ACTIVE").map((c) => c.name)
        : type === "NEW_SUPPLIER"
          ? suppliers.filter((s) => !s.status || s.status === "ACTIVE").map((s) => s.name)
          : products.filter((p) => p.status === "ACTIVE").map((p) => p.name);
    const exact = names.find((n) => n.trim().toLowerCase() === q) ?? null;
    const matches = Array.from(
      new Set(names.filter((n) => n.toLowerCase().includes(q) && n.trim().toLowerCase() !== q)),
    )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 6);
    return { exact, matches, blocking };
  }, [requestForm.requestType, requestForm.subject, categories, suppliers, products]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(callableErrorMessage(err, "Action failed"));
    } finally {
      setBusy(null);
    }
  };

  const approveRequest = (id: string) =>
    run(`pr-${id}`, () => api.approvePurchaseRequest({ purchaseRequestId: id }));
  const rejectRequest = (id: string) =>
    run(`pr-${id}`, () => api.rejectPurchaseRequest({ purchaseRequestId: id }));

  // Send the admin to the page where the new product/category/supplier is created.
  // Passing fulfillRequestId links the created record back to this request.
  const goFulfill = (r: PurchaseRequest) => {
    const path = requestMeta(r).createPath;
    if (!path) return;
    navigate(path, {
      state: { openCreate: true, prefillName: r.subject, fulfillRequestId: r.id },
    });
  };

  const approveAndFulfill = (r: PurchaseRequest) =>
    run(`pr-${r.id}`, async () => {
      await api.approvePurchaseRequest({ purchaseRequestId: r.id });
      goFulfill(r);
    });

  const createPoFromRequest = (r: PurchaseRequest) => {
    navigate("/purchase-orders", {
      state: {
        prefill: {
          branchId: r.branchId,
          requestIds: [r.id],
          lines: [{ productId: r.productId, expectedQty: r.suggestedQty }],
        },
      },
    });
  };

  const approveAdjustment = (id: string) =>
    run(`adj-${id}`, () => api.approveStockAdjustment({ adjustmentId: id }));
  const rejectAdjustment = (id: string) => {
    const note = window.prompt("Reason for rejecting this adjustment (optional):") ?? undefined;
    return run(`adj-${id}`, () => api.rejectStockAdjustment({ adjustmentId: id, note }));
  };

  const approveVoid = (id: string) => run(`void-${id}`, () => api.approveSaleVoid({ voidRequestId: id }));
  const rejectVoid = (id: string) => run(`void-${id}`, () => api.rejectSaleVoid({ voidRequestId: id }));

  const approvePermission = (id: string) =>
    run(`perm-${id}`, () => api.approvePermissionRequest({ requestId: id }));
  const rejectPermission = (id: string) => {
    const note = window.prompt("Reason for declining this access request (optional):") ?? undefined;
    return run(`perm-${id}`, () => api.rejectPermissionRequest({ requestId: id, note }));
  };

  const openPermModal = (permission: RequestablePermission) => {
    setPermForm({ permission, reason: "" });
    setPermError(null);
    setPermModalOpen(true);
  };

  const submitPermissionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPerm(true);
    setPermError(null);
    try {
      await api.createPermissionRequest({
        permission: permForm.permission,
        reason: permForm.reason.trim() || undefined,
      });
      setPermModalOpen(false);
      setPermForm({ permission: "canChangePrice", reason: "" });
    } catch (err) {
      setPermError(callableErrorMessage(err, "Failed to submit request"));
    } finally {
      setSavingPerm(false);
    }
  };

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const type = requestForm.requestType;
    const description = requestForm.description.trim();
    const subject = requestForm.subject.trim();
    const origin: "ADMIN" | "BRANCH" = isStoreAdmin(user!) ? "ADMIN" : "BRANCH";

    let payload: Parameters<typeof api.createPurchaseRequest>[0];

    if (type === "PRODUCT_REORDER") {
      if (!requestForm.productId) {
        setRequestError("Select a product to restock.");
        return;
      }
      const qty = parseInteger(requestForm.qty, 0);
      if (qty < 1) {
        setRequestError("Enter a quantity of at least 1.");
        return;
      }
      payload = { requestType: type, origin, productId: requestForm.productId, suggestedQty: qty, description: description || undefined };
    } else {
      if (!subject) {
        setRequestError("Enter a name for what you're requesting.");
        return;
      }
      if ((type === "NEW_CATEGORY" || type === "NEW_SUPPLIER") && existingMatches.exact) {
        setRequestError(
          `“${existingMatches.exact}” already exists — no need to request it.`,
        );
        return;
      }
      if (!description) {
        setRequestError("Add a short description so the admin understands the request.");
        return;
      }
      const qty = type === "NEW_PRODUCT" ? parseInteger(requestForm.qty, 0) : 0;
      payload = {
        requestType: type,
        origin,
        subject,
        suggestedQty: qty > 0 ? qty : undefined,
        description,
      };
    }

    setSavingRequest(true);
    setRequestError(null);
    try {
      const res = await api.createPurchaseRequest(payload);
      setRequestModalOpen(false);
      setRequestForm(emptyRequestForm());
      // Admin-initiated new-item requests are auto-approved — go create it now.
      if (origin === "ADMIN" && type !== "PRODUCT_REORDER") {
        const path = REQUEST_TYPE_META[type].createPath;
        if (path) {
          navigate(path, {
            state: { openCreate: true, prefillName: subject, fulfillRequestId: res.data.purchaseRequestId },
          });
        }
      }
    } catch (err) {
      setRequestError(callableErrorMessage(err, "Failed to submit request"));
    } finally {
      setSavingRequest(false);
    }
  };

  const unreadThreads = useMemo(
    () =>
      threads.filter((t) => {
        const lastRead = t.reads?.[uid] ?? 0;
        return (t.lastMessageAt ?? 0) > lastRead && t.lastSenderId !== uid;
      }),
    [threads, uid],
  );

  if (!user) return <LoadingSpinner />;
  if (loading) return <LoadingSpinner />;

  const canManage = isManagerOrAbove(user);
  const canAdmin = isStoreAdmin(user);
  const canApproveAdj = canApproveAdjustment(user);
  const canRequest = canCreatePurchaseRequest(user);
  const canReqPerms = canRequestPermissions(user);

  const ungrantedPermissions = REQUESTABLE_PERMISSIONS.filter((p) => !hasRequestablePermission(user, p.key));
  const pendingPermKeys = new Set(
    myPermissionRequests.filter((r) => r.status === "PENDING").map((r) => r.permission),
  );

  const totalPending =
    purchaseRequests.length + adjustments.length + voidRequests.length + permissionRequests.length;

  return (
    <div>
      <PageHeader
        title="Activity & Approvals"
        description="Branch requests, approvals, and team conversations in one place"
        actions={
          canAdmin ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => navigate("/purchase-orders", { state: { openCreate: true } })} className="btn-primary">
                <ShoppingCart size={18} /> Create PO
              </button>
              <button
                onClick={() => {
                  setRequestForm({ ...emptyRequestForm(), requestType: "NEW_PRODUCT" });
                  setRequestError(null);
                  setRequestModalOpen(true);
                }}
                className="btn-secondary"
              >
                <PackagePlus size={18} /> New item
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {canRequest && (
                <button
                  onClick={() => {
                    setRequestForm(emptyRequestForm());
                    setRequestError(null);
                    setRequestModalOpen(true);
                  }}
                  className="btn-primary"
                >
                  <Plus size={18} /> New request
                </button>
              )}
              {canReqPerms && ungrantedPermissions.length > 0 && (
                <button onClick={() => openPermModal(ungrantedPermissions[0].key)} className="btn-secondary">
                  <KeyRound size={18} /> Request access
                </button>
              )}
            </div>
          )
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {totalPending === 0 && unreadThreads.length === 0 && approvedRequests.length === 0 && (
        <div className="card mb-4 text-center text-sm text-slate-500">
          Nothing needs your attention right now.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={<PackagePlus size={18} className="text-violet-500" />}
          title="Purchase requests"
          count={purchaseRequests.length}
        >
          {purchaseRequests.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No pending requests</p>
          ) : (
            <ul className="stagger-children space-y-2">
              {purchaseRequests.map((r) => {
                const meta = requestMeta(r);
                const isReorder = !!r.productId;
                return (
                <li key={r.id} className="rounded-lg border border-slate-200 p-3 transition hover:border-violet-200">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link to={`/requests/${r.id}`} className="min-w-0 group">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-slate-900 group-hover:text-brand-700">
                        <span className={meta.badge}>{meta.label}</span>
                        {requestTitle(r)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.suggestedQty ? `Qty ${r.suggestedQty} · ` : ""}
                        {isReorder && r.currentStock != null ? `stock ${r.currentStock} · ` : ""}
                        {branchName(r.branchId)} · {r.requestedByName || userName(r.requestedBy)}
                        {r.origin === "ADMIN" ? " · admin initiated" : ""}
                      </p>
                      {(r.description || r.notes) && (
                        <p className="mt-1 text-xs italic text-slate-500">“{r.description || r.notes}”</p>
                      )}
                    </Link>
                    {canAdmin && (
                      <div className="flex flex-wrap gap-2">
                        {isReorder ? (
                          <>
                            <button
                              onClick={() => createPoFromRequest(r)}
                              disabled={busy === `pr-${r.id}`}
                              className="btn-primary px-3 py-1 text-sm"
                            >
                              <ShoppingCart size={14} /> Approve & create PO
                            </button>
                            <button
                              onClick={() => approveRequest(r.id)}
                              disabled={busy === `pr-${r.id}`}
                              className="btn-secondary px-3 py-1 text-sm"
                            >
                              Approve only
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => approveAndFulfill(r)}
                            disabled={busy === `pr-${r.id}`}
                            className="btn-primary px-3 py-1 text-sm"
                          >
                            <Plus size={14} /> Approve &amp; create
                          </button>
                        )}
                        <button
                          onClick={() => rejectRequest(r.id)}
                          disabled={busy === `pr-${r.id}`}
                          className="btn-secondary px-3 py-1 text-sm text-red-600"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        {canAdmin && (
          <SectionCard
            icon={<CheckCircle2 size={18} className="text-emerald-500" />}
            title="Approved · ready to order"
            count={approvedRequests.length}
          >
            {approvedRequests.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No approved requests waiting</p>
            ) : (
              <ul className="stagger-children space-y-2">
                {approvedRequests.map((r) => {
                  const meta = requestMeta(r);
                  const isReorder = !!r.productId;
                  return (
                  <li key={r.id} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/requests/${r.id}`} className="min-w-0 group">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-slate-900 group-hover:text-brand-700">
                          <span className={meta.badge}>{meta.label}</span>
                          {requestTitle(r)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.suggestedQty ? `Qty ${r.suggestedQty} · ` : ""}
                          {branchName(r.branchId)} · approved by {r.reviewedByName || userName(r.reviewedBy)}
                        </p>
                        {(r.description || r.notes) && (
                          <p className="mt-1 text-xs italic text-slate-500">“{r.description || r.notes}”</p>
                        )}
                      </Link>
                      {isReorder ? (
                        <button onClick={() => createPoFromRequest(r)} className="btn-primary px-3 py-1 text-sm">
                          <ShoppingCart size={14} /> Create PO
                        </button>
                      ) : meta.createPath ? (
                        <button
                          onClick={() => goFulfill(r)}
                          className="btn-primary px-3 py-1 text-sm"
                        >
                          <Plus size={14} /> Create {meta.label.toLowerCase()}
                        </button>
                      ) : null}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        )}

        <SectionCard
          icon={<ClipboardCheck size={18} className="text-sky-500" />}
          title="Stock adjustments"
          count={adjustments.length}
        >
          {adjustments.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No pending adjustments</p>
          ) : (
            <ul className="stagger-children space-y-2">
              {adjustments.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {a.productName}{" "}
                        <span className={a.quantityChange < 0 ? "text-red-600" : "text-emerald-600"}>
                          {a.quantityChange > 0 ? "+" : ""}
                          {a.quantityChange}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {a.reason} · {branchName(a.branchId)} · {userName(a.requestedBy)}
                      </p>
                    </div>
                    {canApproveAdj && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveAdjustment(a.id)}
                          disabled={busy === `adj-${a.id}`}
                          className="btn-primary px-3 py-1 text-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectAdjustment(a.id)}
                          disabled={busy === `adj-${a.id}`}
                          className="btn-secondary px-3 py-1 text-sm text-red-600"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          icon={<ShieldAlert size={18} className="text-amber-500" />}
          title="Void requests"
          count={voidRequests.length}
        >
          {voidRequests.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No pending void requests</p>
          ) : (
            <ul className="stagger-children space-y-2">
              {voidRequests.map((v) => (
                <li key={v.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">Sale #{v.saleId.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-slate-500">
                        {branchName(v.branchId)} · {v.requestedByName || userName(v.requestedBy)} ·{" "}
                        {formatDate(v.requestedAt)}
                      </p>
                      <p className="mt-1 text-xs italic text-slate-500">“{v.reason}”</p>
                    </div>
                    {canManage && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveVoid(v.id)}
                          disabled={busy === `void-${v.id}`}
                          className="btn-primary px-3 py-1 text-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectVoid(v.id)}
                          disabled={busy === `void-${v.id}`}
                          className="btn-secondary px-3 py-1 text-sm"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {canAdmin && (
          <SectionCard
            icon={<KeyRound size={18} className="text-indigo-500" />}
            title="Access requests"
            count={permissionRequests.length}
          >
            {permissionRequests.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No access requests</p>
            ) : (
              <ul className="stagger-children space-y-2">
                {permissionRequests.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{permLabel(r.permission)}</p>
                        <p className="text-xs text-slate-500">
                          {branchName(r.branchId)} · {r.requestedByName || userName(r.requestedBy)} ·{" "}
                          {formatDate(r.createdAt)}
                        </p>
                        {r.reason && <p className="mt-1 text-xs italic text-slate-500">“{r.reason}”</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approvePermission(r.id)}
                          disabled={busy === `perm-${r.id}`}
                          className="btn-primary px-3 py-1 text-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => rejectPermission(r.id)}
                          disabled={busy === `perm-${r.id}`}
                          className="btn-secondary px-3 py-1 text-sm text-red-600"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}

        {canReqPerms && (
          <SectionCard
            icon={<KeyRound size={18} className="text-indigo-500" />}
            title="My access"
            count={REQUESTABLE_PERMISSIONS.length}
          >
            <ul className="stagger-children space-y-2">
              {REQUESTABLE_PERMISSIONS.map((p) => {
                const granted = hasRequestablePermission(user, p.key);
                const pending = pendingPermKeys.has(p.key);
                return (
                  <li
                    key={p.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{p.label}</p>
                      <p className="text-xs text-slate-500">{p.description}</p>
                    </div>
                    {granted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 size={13} /> Granted
                      </span>
                    ) : pending ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Pending
                      </span>
                    ) : (
                      <button onClick={() => openPermModal(p.key)} className="btn-secondary px-3 py-1 text-sm">
                        Request
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        )}

        {canRequest && (
          <SectionCard
            icon={<PackagePlus size={18} className="text-brand-600" />}
            title="My requests"
            count={myRequests.length}
          >
            {myRequests.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">You haven’t made any requests yet</p>
            ) : (
              <ul className="stagger-children space-y-2">
                {myRequests.map((r) => {
                  const meta = requestMeta(r);
                  return (
                  <li key={r.id}>
                    <Link
                      to={`/requests/${r.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 transition hover:border-brand-200 hover:bg-brand-50/30"
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-slate-900">
                          <span className={meta.badge}>{meta.label}</span>
                          {requestTitle(r)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.suggestedQty ? `Qty ${r.suggestedQty} · ` : ""}
                          {formatDate(r.createdAt)}
                          {r.reviewedByName ? ` · reviewed by ${r.reviewedByName}` : ""}
                        </p>
                      </div>
                      <span className={statusBadgeClass(r.status)}>{r.status}</span>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        )}

        <SectionCard
          icon={<MessageSquare size={18} className="text-brand-600" />}
          title="Conversations"
          count={threads.length}
        >
          {threads.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No conversations yet</p>
          ) : (
            <ul className="stagger-children space-y-2">
              {threads.map((t) => {
                const lastRead = t.reads?.[uid] ?? 0;
                const unread = (t.lastMessageAt ?? 0) > lastRead && t.lastSenderId !== uid;
                const to =
                  (t.contextType === "PURCHASE_ORDER" || t.contextType === "DELIVERY") && t.contextId
                    ? `/deliveries/${t.contextId}`
                    : "/activity";
                return (
                  <li key={t.id}>
                    <Link
                      to={to}
                      className={`block rounded-lg border p-3 transition hover:bg-slate-50 ${
                        unread ? "border-brand-200 bg-brand-50/40" : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-slate-900">{t.title}</p>
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                      </div>
                      {t.lastMessage && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {t.lastSenderName}: {t.lastMessage}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <Modal
        open={requestModalOpen}
        onClose={() => !savingRequest && setRequestModalOpen(false)}
        title="New request"
      >
        <form onSubmit={submitRequest} className="space-y-4" noValidate>
          <div>
            <label className="mb-1.5 block text-sm font-medium">What do you need?</label>
            <div className="grid grid-cols-2 gap-2">
              {(canAdmin
                ? REQUEST_TYPE_OPTIONS.filter((o) => o.value !== "PRODUCT_REORDER")
                : REQUEST_TYPE_OPTIONS
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRequestForm((f) => ({ ...f, requestType: opt.value }))}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    requestForm.requestType === opt.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {requestForm.requestType === "PRODUCT_REORDER" ? (
            <>
              <SearchableSelect
                label="Category *"
                value={requestForm.categoryId}
                onChange={(categoryId) => setRequestForm((f) => ({ ...f, categoryId, productId: "" }))}
                options={categoryOptions}
                placeholder="Select category..."
                searchPlaceholder="Search categories..."
                emptyMessage="No categories found"
              />
              <SearchableSelect
                label="Product *"
                value={requestForm.productId}
                onChange={(productId) => setRequestForm((f) => ({ ...f, productId }))}
                options={requestForm.categoryId ? productsForCategory(requestForm.categoryId) : []}
                placeholder={requestForm.categoryId ? "Select product..." : "Pick a category first"}
                searchPlaceholder="Search products..."
                disabled={!requestForm.categoryId}
                emptyMessage={requestForm.categoryId ? "No products in this category" : "Select a category first"}
              />
              <IntegerInput
                label="Quantity needed *"
                value={requestForm.qty}
                onChange={(qty) => setRequestForm((f) => ({ ...f, qty }))}
                placeholder="e.g. 24"
              />
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {requestForm.requestType === "NEW_PRODUCT"
                    ? "Product name *"
                    : requestForm.requestType === "NEW_CATEGORY"
                      ? "Category name *"
                      : "Supplier name *"}
                </label>
                <input
                  className="input-field"
                  value={requestForm.subject}
                  onChange={(e) => setRequestForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder={
                    requestForm.requestType === "NEW_PRODUCT"
                      ? "e.g. Coca-Cola 1.5L"
                      : requestForm.requestType === "NEW_CATEGORY"
                        ? "e.g. Frozen Goods"
                        : "e.g. San Miguel Distribution"
                  }
                  autoComplete="off"
                />

                {existingMatches.exact && existingMatches.blocking && (
                  <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    “{existingMatches.exact}” already exists. Pick it from the list instead of
                    requesting a duplicate.
                  </p>
                )}

                {!existingMatches.exact && existingMatches.matches.length > 0 && (
                  <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="px-1 pb-1 text-xs font-medium text-slate-500">
                      {existingMatches.blocking
                        ? "Already exists — did you mean:"
                        : "Similar items already exist:"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {existingMatches.matches.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setRequestForm((f) => ({ ...f, subject: name }))}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {requestForm.requestType === "NEW_PRODUCT" && (
                <IntegerInput
                  label="Quantity needed (optional)"
                  value={requestForm.qty}
                  onChange={(qty) => setRequestForm((f) => ({ ...f, qty }))}
                  placeholder="e.g. 24"
                />
              )}
            </>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">
              Description {requestForm.requestType === "PRODUCT_REORDER" ? "(optional)" : "*"}
            </label>
            <textarea
              className="input-field"
              value={requestForm.description}
              onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={
                requestForm.requestType === "NEW_SUPPLIER"
                  ? "Supplier contact, products they carry, why we should add them..."
                  : requestForm.requestType === "NEW_CATEGORY"
                    ? "What products would go in this category and why it's needed..."
                    : requestForm.requestType === "NEW_PRODUCT"
                      ? "Brand, size, supplier, price, and why customers need it..."
                      : "Why is this needed? (optional)"
              }
            />
          </div>
          {canAdmin && requestForm.requestType !== "PRODUCT_REORDER" && (
            <p className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-brand-700">
              As an admin this is auto-approved — you’ll be taken straight to the create page to finish it.
            </p>
          )}
          {requestError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {requestError}
            </div>
          )}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => setRequestModalOpen(false)}
              className="btn-secondary"
              disabled={savingRequest}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={savingRequest || (existingMatches.blocking && !!existingMatches.exact)}
            >
              {savingRequest
                ? "Submitting..."
                : canAdmin && requestForm.requestType !== "PRODUCT_REORDER"
                  ? "Create now"
                  : "Submit request"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={permModalOpen}
        onClose={() => !savingPerm && setPermModalOpen(false)}
        title="Request access"
      >
        <form onSubmit={submitPermissionRequest} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Permission</label>
            <select
              className="input-field"
              value={permForm.permission}
              onChange={(e) => setPermForm((f) => ({ ...f, permission: e.target.value as RequestablePermission }))}
            >
              {ungrantedPermissions.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">{permDescription(permForm.permission)}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Reason (optional)</label>
            <textarea
              className="input-field"
              value={permForm.reason}
              onChange={(e) => setPermForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Why do you need this access?"
            />
          </div>
          <p className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-700">
            An admin will review your request. You’ll be notified once it’s approved or declined.
          </p>
          {permError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {permError}
            </div>
          )}
          <div className="form-actions">
            <button type="button" onClick={() => setPermModalOpen(false)} className="btn-secondary" disabled={savingPerm}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={savingPerm || ungrantedPermissions.length === 0}>
              {savingPerm ? "Submitting..." : "Submit request"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
