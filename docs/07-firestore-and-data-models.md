# Data Models & Structure

All tenant data is scoped under `stores/{storeId}/`.

---

## Collection Tree

```
stores/{storeId}
├── (store document)
├── branches/{branchId}
├── users/{userId}
├── categories/{categoryId}
├── products/{productId}
├── suppliers/{supplierId}
├── purchaseOrders/{poId}
├── deliveryReceipts/{deliveryId}
├── sales/{saleId}
├── stockMovements/{movementId}
├── promos/{promoId}
├── criticalStocks/{productId}
├── disposals/{disposalId}
├── auditLogs/{logId}
├── dashboardStats/main
└── dailyReports/{yyyy-mm-dd}
```

---

## Collection Descriptions

| Collection | Purpose |
|------------|---------|
| `stores` | Tenant root — store profile, settings |
| `branches` | Physical store locations |
| `users` | Staff accounts, roles, permissions |
| `categories` | Product categories |
| `products` | Product catalog and stock levels |
| `suppliers` | Supplier directory |
| `purchaseOrders` | PO headers and line items |
| `deliveryReceipts` | Completed receiving records |
| `sales` | Completed POS transactions |
| `stockMovements` | Audit trail for every stock change |
| `promos` | Promotional rules |
| `criticalStocks` | Denormalized critical stock alerts |
| `disposals` | Disposal / write-off records |
| `auditLogs` | Price changes, permission changes, etc. |
| `dashboardStats` | Aggregated stats (`main` document) |
| `dailyReports` | Per-day rollup snapshots |

---

## TypeScript Interfaces

### Product

```typescript
interface Product {
  id: string;
  storeId: string;
  branchId?: string;
  name: string;
  categoryId: string;
  unit: string;
  sellingPrice: number;
  currentStock: number;
  reorderLevel: number;
  criticalLevel: number;
  status: "ACTIVE" | "INACTIVE";

  barcode?: string;
  internalBarcode?: string;
  sku?: string;
  brand?: string;
  description?: string;
  supplierId?: string;
  supplierCost?: number;
  imageUrl?: string;
  expiryDate?: string;
  remarks?: string;

  createdAt: number;
  updatedAt: number;
}
```

### Purchase Order

```typescript
interface PurchaseOrder {
  id: string;
  storeId: string;
  branchId: string;
  supplierId: string;
  poNumber: string;
  expectedDeliveryDate: string;
  status:
    | "DRAFT"
    | "ORDERED"
    | "IN_TRANSIT"
    | "PARTIALLY_RECEIVED"
    | "RECEIVED"
    | "CANCELLED";
  items: PurchaseOrderItem[];
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
}

interface PurchaseOrderItem {
  productId: string;
  productName: string;
  expectedQty: number;
  sellingPrice?: number;
  expectedCost?: number;
}
```

### Delivery Receipt

```typescript
interface DeliveryReceipt {
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

interface DeliveryReceiptItem {
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
```

### Sale

```typescript
interface Sale {
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
  status: "COMPLETED" | "VOIDED" | "REFUNDED";
  createdAt: number;
}

interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  promoId?: string;
}
```

### Disposal

```typescript
interface Disposal {
  id: string;
  storeId: string;
  branchId: string;
  productId: string;
  productName: string;
  quantity: number;
  reason:
    | "EXPIRED"
    | "DAMAGED"
    | "SPOILED"
    | "LOST"
    | "RETURNED_TO_SUPPLIER"
    | "DISPOSED"
    | "OTHER";
  remarks?: string;
  photoUrl?: string;
  createdBy: string;
  createdAt: number;
}
```

### Stock Movement

```typescript
interface StockMovement {
  id: string;
  storeId: string;
  branchId: string;
  productId: string;
  type:
    | "DELIVERY_RECEIVED"
    | "SALE"
    | "DISPOSAL"
    | "ADJUSTMENT"
    | "RETURN";
  quantityChange: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  remarks?: string;
  createdBy: string;
  createdAt: number;
}
```

### User

```typescript
interface User {
  id: string;
  storeId: string;
  branchId: string;
  fullName: string;
  email: string;
  role: "OWNER" | "ADMIN" | "STORE_MANAGER" | "CASHIER";
  status: "ACTIVE" | "INACTIVE";
  phoneNumber?: string;
  permissions?: CustomPermissions;
  createdAt: number;
  updatedAt: number;
}

interface CustomPermissions {
  canVoidSale?: boolean;
  canApproveStockAdjustment?: boolean;
  canViewSupplierCost?: boolean;
  canCreatePurchaseRequest?: boolean;
  canChangePrice?: boolean;
}
```

### Promo

```typescript
interface Promo {
  id: string;
  storeId: string;
  name: string;
  type: "PERCENTAGE" | "FIXED" | "PROMO_PRICE" | "BUY_X_GET_Y";
  discountValue: number;
  startDate: string;
  endDate: string;
  productId?: string;
  categoryId?: string;
  branchId?: string;
  status: "ACTIVE" | "INACTIVE";
  minQuantity?: number;
  minSpend?: number;
  usageLimit?: number;
  usageCount?: number;
  createdAt: number;
}
```

### Audit Log

```typescript
interface AuditLog {
  id: string;
  storeId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  performedBy: string;
  createdAt: number;
}
```

---

## Indexing Recommendations

| Collection | Fields | Use case |
|------------|--------|----------|
| `products` | `branchId`, `status`, `name` | POS search |
| `products` | `barcode`, `internalBarcode` | Scan lookup |
| `purchaseOrders` | `branchId`, `expectedDeliveryDate`, `status` | Upcoming deliveries |
| `sales` | `branchId`, `createdAt` | Sales reports |
| `stockMovements` | `productId`, `createdAt` | Movement history |
| `criticalStocks` | `branchId` | Dashboard alerts |

---

## Branch-Scoped Stock

Products may use `branchId` for per-branch stock, or stock may live in a subcollection `products/{productId}/branchStock/{branchId}` depending on implementation. MVP can use `branchId` on the product document for single-branch stores; multi-branch should use branch-level stock documents.
