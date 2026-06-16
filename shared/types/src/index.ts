// ─── Enums & shared literals ───────────────────────────────────────────────

/** PLATFORM_OWNER = platform super-admin; ADMIN = store owner/admin */
export type UserRole = "PLATFORM_OWNER" | "ADMIN" | "STORE_MANAGER" | "CASHIER";
/** @deprecated Use ADMIN or PLATFORM_OWNER */
export type LegacyUserRole = "OWNER";
export type EntityStatus = "ACTIVE" | "INACTIVE";
export type POStatus =
  | "DRAFT"
  | "ORDERED"
  | "IN_TRANSIT"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "COMPLETED"
  | "CANCELLED";
export type StockMovementType =
  | "DELIVERY_RECEIVED"
  | "SALE"
  | "DISPOSAL"
  | "ADJUSTMENT"
  | "RETURN";
export type DisposalReason =
  | "EXPIRED"
  | "DAMAGED"
  | "SPOILED"
  | "LOST"
  | "RETURNED_TO_SUPPLIER"
  | "DISPOSED"
  | "OTHER";
export type PromoType = "PERCENTAGE" | "FIXED" | "PROMO_PRICE" | "BUY_X_GET_Y";
export type SaleStatus = "COMPLETED" | "VOIDED" | "REFUNDED";

export type SaleVoidRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface SaleVoidRequest {
  id: string;
  storeId: string;
  branchId: string;
  saleId: string;
  reason: string;
  status: SaleVoidRequestStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: number;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  reviewNote?: string;
}
export type AdjustmentStatus = "PENDING" | "APPROVED" | "REJECTED";
export type PurchaseRequestStatus = "PENDING" | "APPROVED" | "ORDERED" | "FULFILLED" | "REJECTED";

// ─── Permissions ───────────────────────────────────────────────────────────

export interface CustomPermissions {
  canVoidSale?: boolean;
  canApproveStockAdjustment?: boolean;
  canViewSupplierCost?: boolean;
  canCreatePurchaseRequest?: boolean;
  canChangePrice?: boolean;
}

/**
 * Permissions a branch manager / cashier can request for themselves. Each
 * request is reviewed by a store admin; approval grants the flag on the user.
 */
export type RequestablePermission =
  | "canApproveStockAdjustment"
  | "canViewSupplierCost"
  | "canCreatePurchaseRequest"
  | "canChangePrice";

export type PermissionRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Lives at stores/{storeId}/permissionRequests/{id}. Written by Cloud Functions only. */
export interface PermissionRequest {
  id: string;
  storeId: string;
  branchId: string;
  permission: RequestablePermission;
  /** Why the requester needs the access. */
  reason?: string;
  status: PermissionRequestStatus;
  requestedBy: string;
  requestedByName?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  reviewNote?: string;
  createdAt: number;
  updatedAt?: number;
}

// ─── Store & Branch ──────────────────────────────────────────────────────────

export interface Store {
  id: string;
  name: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxRate: number;
  taxInclusive: boolean;
  currency: string;
  receiptHeader?: string;
  receiptFooter?: string;
  paymentMethods: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Branch {
  id: string;
  storeId: string;
  name: string;
  address?: string;
  phone?: string;
  status: EntityStatus;
  createdAt: number;
  updatedAt: number;
}

// ─── User ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  storeId: string;
  branchId: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: EntityStatus;
  phoneNumber?: string;
  permissions?: CustomPermissions;
  createdAt: number;
  updatedAt: number;
}

export interface RegisteredEmail {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  storeId?: string;
  branchId?: string;
  status: EntityStatus;
  claimed: boolean;
  claimedUid?: string;
  claimedAt?: number;
  permissions?: CustomPermissions;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
}

export interface PlatformOwner {
  id: string;
  email: string;
  fullName: string;
  createdAt: number;
}

// ─── Catalog ───────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  storeId: string;
  name: string;
  description?: string;
  requiresExpiryDate?: boolean;
  status: EntityStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Product {
  id: string;
  storeId: string;
  name: string;
  categoryId: string;
  unit: string;
  /** Size per item when unit is weight/volume, e.g. 400 with unit g = 400g bottle */
  unitSize?: number;
  /** How inventory is counted — often pcs when unitSize is set */
  stockUnit?: string;
  sellingPrice: number;
  reorderLevel: number;
  criticalLevel: number;
  status: EntityStatus;
  barcode?: string;
  internalBarcode?: string;
  sku?: string;
  brand?: string;
  description?: string;
  supplierId?: string;
  supplierCost?: number;
  imageUrl?: string;
  remarks?: string;
  /** Branch where the product is primarily stocked / first assigned */
  primaryBranchId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BranchInventory {
  id: string;
  storeId: string;
  branchId: string;
  productId: string;
  currentStock: number;
  reorderLevel: number;
  criticalLevel: number;
  expiryDate?: string;
  updatedAt: number;
}

export interface Supplier {
  id: string;
  storeId: string;
  name: string;
  contactPerson?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
  status: EntityStatus;
  createdAt: number;
  updatedAt: number;
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  expectedQty: number;
  receivedQty?: number;
  sellingPrice?: number;
  expectedCost?: number;
}

export interface PurchaseOrder {
  id: string;
  storeId: string;
  branchId: string;
  supplierId: string;
  poNumber: string;
  supplierReferenceNumber?: string;
  expectedDeliveryDate: string;
  expectedCost?: number;
  notes?: string;
  attachmentUrl?: string;
  status: POStatus;
  items: PurchaseOrderItem[];
  /** Purchase requests this PO fulfils (when created from branch requests). */
  purchaseRequestIds?: string[];
  createdBy: string;
  createdByName?: string;
  completedBy?: string;
  completedByName?: string;
  completedAt?: number;
  createdAt: number;
  updatedAt?: number;
}

/** What a branch is asking the admin for. */
export type PurchaseRequestType =
  | "PRODUCT_REORDER"
  | "NEW_PRODUCT"
  | "NEW_CATEGORY"
  | "NEW_SUPPLIER";

export interface PurchaseRequest {
  id: string;
  storeId: string;
  branchId: string;
  /** Defaults to PRODUCT_REORDER for legacy records created before request types. */
  requestType?: PurchaseRequestType;
  /** Who started the request. Admin-initiated requests are auto-approved. Defaults to BRANCH. */
  origin?: "BRANCH" | "ADMIN";
  /** Proposed name for a new product / category / supplier request. */
  subject?: string;
  /** Free-text explanation so the admin understands the request. */
  description?: string;
  /** Set for product reorders (and once a NEW_PRODUCT request is fulfilled). */
  productId?: string;
  productName?: string;
  suggestedQty?: number;
  currentStock?: number;
  criticalLevel?: number;
  status: PurchaseRequestStatus;
  requestedBy: string;
  requestedByName?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  reviewNote?: string;
  /** PO created to fulfil this request. */
  purchaseOrderId?: string;
  /** Who completed the request by creating the product/category/supplier. */
  fulfilledBy?: string;
  fulfilledByName?: string;
  fulfilledAt?: number;
  /** Id of the product/category/supplier created to satisfy a new-item request. */
  resultId?: string;
  createdAt: number;
  updatedAt?: number;
  notes?: string;
}

// ─── Procurement transaction log ─────────────────────────────────────────────

/** A single immutable event in the request → PO → delivery → completion timeline. */
export type ProcurementEventType =
  | "REQUEST_CREATED"
  | "REQUEST_UPDATED"
  | "REQUEST_APPROVED"
  | "REQUEST_REJECTED"
  | "REQUEST_FULFILLED"
  | "PO_CREATED"
  | "PO_ORDERED"
  | "PO_IN_TRANSIT"
  | "DELIVERY_RECEIVED"
  | "DELIVERY_DISCREPANCY"
  | "PO_COMPLETED"
  | "PO_CANCELLED";

/** Lives at stores/{storeId}/procurementEvents/{eventId}. Written by Cloud Functions only. */
export interface ProcurementEvent {
  id: string;
  storeId: string;
  branchId: string;
  type: ProcurementEventType;
  message: string;
  /** Related purchase order (when applicable). */
  poId?: string;
  poNumber?: string;
  /** Related purchase request (when applicable). */
  requestId?: string;
  actorId: string;
  actorName?: string;
  actorRole?: UserRole;
  meta?: Record<string, unknown>;
  createdAt: number;
}

// ─── Delivery ────────────────────────────────────────────────────────────────

export interface DeliveryReceiptItem {
  productId: string;
  productName: string;
  expectedQty: number;
  receivedQty: number;
  damagedQty?: number;
  acceptedQty: number;
  missingQty: number;
  expiryDate?: string;
  remarks?: string;
  photoProofUrl?: string;
}

export interface DeliveryReceipt {
  id: string;
  storeId: string;
  branchId: string;
  purchaseOrderId: string;
  supplierId: string;
  receivedBy: string;
  receivedAt: number;
  items: DeliveryReceiptItem[];
  supplierDeliveryNumber?: string;
}

// ─── Sales & Promos ──────────────────────────────────────────────────────────

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  promoId?: string;
}

export interface Sale {
  id: string;
  storeId: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  /** GCash / bank transfer reference */
  paymentReference?: string;
  /** PWD or Senior Citizen 20% discount applied */
  pwdOrSeniorDiscount?: boolean;
  pwdSeniorDiscountAmount?: number;
  /** Cash payment — amount received from customer */
  amountTendered?: number;
  /** Cash payment — change returned */
  changeGiven?: number;
  customerEmail?: string;
  customerPhone?: string;
  status: SaleStatus;
  voidReason?: string;
  pendingVoidRequestId?: string;
  voidedBy?: string;
  voidedAt?: number;
  createdAt: number;
}

export interface Promo {
  id: string;
  storeId: string;
  name: string;
  type: PromoType;
  discountValue: number;
  startDate: string;
  endDate: string;
  productId?: string;
  categoryId?: string;
  branchId?: string;
  status: EntityStatus;
  minQuantity?: number;
  minSpend?: number;
  usageLimit?: number;
  usageCount?: number;
  buyQuantity?: number;
  getQuantity?: number;
  createdAt: number;
  updatedAt?: number;
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export interface Disposal {
  id: string;
  storeId: string;
  branchId: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: DisposalReason;
  remarks?: string;
  photoUrl?: string;
  createdBy: string;
  createdAt: number;
}

export interface StockMovement {
  id: string;
  storeId: string;
  branchId: string;
  productId: string;
  productName?: string;
  type: StockMovementType;
  quantityChange: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  remarks?: string;
  createdBy: string;
  createdAt: number;
}

export interface StockAdjustment {
  id: string;
  storeId: string;
  branchId: string;
  productId: string;
  productName: string;
  quantityChange: number;
  reason: string;
  remarks?: string;
  status: AdjustmentStatus;
  requestedBy: string;
  requestedByName?: string;
  approvedBy?: string;
  reviewedByName?: string;
  reviewNote?: string;
  createdAt: number;
  updatedAt?: number;
  resolvedAt?: number;
}

export interface CriticalStock {
  id: string;
  storeId: string;
  branchId: string;
  productId: string;
  productName: string;
  currentStock: number;
  criticalLevel: number;
  reorderLevel: number;
  suggestedOrderQty: number;
  updatedAt: number;
}

// ─── Audit & Reports ─────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  storeId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  performedBy: string;
  performedByName?: string;
  createdAt: number;
}

export interface DashboardStats {
  todaySales: number;
  todayTransactions: number;
  criticalStockCount: number;
  lowStockCount: number;
  pendingDeliveries: number;
  partialDeliveries: number;
  inventoryValue: number;
  todayProfit: number;
  updatedAt: number;
}

export interface DailyReport {
  id: string;
  storeId: string;
  branchId?: string;
  date: string;
  totalSales: number;
  totalTransactions: number;
  totalProfit: number;
  topProducts: { productId: string; productName: string; quantity: number; revenue: number }[];
  createdAt: number;
}

// ─── Communication (threads & messages) ─────────────────────────────────────

/** What a conversation thread is attached to. */
export type ThreadContextType =
  | "PURCHASE_ORDER"
  | "DELIVERY"
  | "PURCHASE_REQUEST"
  | "STOCK_ADJUSTMENT"
  | "SALE_VOID"
  | "GENERAL";

export type ThreadStatus = "OPEN" | "CLOSED";

/**
 * A real-time conversation between store staff (admin ↔ manager ↔ cashier),
 * usually anchored to an operational record (a PO, a delivery, a request).
 * Lives at stores/{storeId}/threads/{threadId}.
 */
export interface Thread {
  id: string;
  storeId: string;
  branchId: string;
  contextType: ThreadContextType;
  /** Id of the anchor record (poId, deliveryId, requestId…). Empty for GENERAL. */
  contextId: string;
  title: string;
  /** Uids of everyone who has posted / been added. */
  participantUids: string[];
  lastMessage?: string;
  lastSenderId?: string;
  lastSenderName?: string;
  lastSenderRole?: UserRole;
  lastMessageAt?: number;
  messageCount: number;
  /** Per-user last-read timestamp. Unread when lastMessageAt > reads[uid]. */
  reads: Record<string, number>;
  status: ThreadStatus;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/** A single chat message inside a thread (stores/{storeId}/threads/{threadId}/messages/{id}). */
export interface ThreadMessage {
  id: string;
  threadId: string;
  storeId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  /** Soft-deleted (unsent) — hidden in UI but kept for audit. */
  deleted?: boolean;
  createdAt: number;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationKind =
  | "NEW_MESSAGE"
  | "PO_CREATED"
  | "DELIVERY_RECEIVED"
  | "DELIVERY_DISCREPANCY"
  | "PURCHASE_REQUEST"
  | "PURCHASE_REQUEST_RESOLVED"
  | "PO_COMPLETED"
  | "STOCK_ADJUSTMENT_REQUEST"
  | "STOCK_ADJUSTMENT_RESOLVED"
  | "SALE_VOID_REQUEST"
  | "SALE_VOID_RESOLVED"
  | "PERMISSION_REQUEST"
  | "PERMISSION_REQUEST_RESOLVED";

/**
 * Per-recipient in-app notification. One doc is written per recipient so unread
 * state and security rules stay simple. Lives at stores/{storeId}/notifications/{id}.
 */
export interface StoreNotification {
  id: string;
  storeId: string;
  recipientUid: string;
  branchId?: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Web route to open when clicked. */
  link?: string;
  /** Deep-link metadata for mobile navigation. */
  refType?: string;
  refId?: string;
  threadId?: string;
  read: boolean;
  actorId?: string;
  actorName?: string;
  createdAt: number;
}

// ─── Callable payloads ───────────────────────────────────────────────────────

export interface CartItemInput {
  productId: string;
  quantity: number;
}

export interface ReceiveDeliveryItemInput {
  productId: string;
  receivedQty: number;
  damagedQty?: number;
  expiryDate?: string;
  remarks?: string;
  photoProofUrl?: string;
}

export interface ApplyPromoResult {
  items: SaleItem[];
  totalDiscount: number;
  appliedPromoIds: string[];
}

export type SendMessageInput = {
  /** Reuse an existing thread, or omit to get-or-create by context. */
  threadId?: string;
  contextType?: ThreadContextType;
  contextId?: string;
  /** Title used when a thread is created. */
  title?: string;
  branchId?: string;
  text: string;
};

export type SendMessageResult = {
  threadId: string;
  messageId: string;
};
