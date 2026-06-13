# Cloud Functions

Firebase Cloud Functions (TypeScript) handle all sensitive business logic. Clients call these via HTTPS callable functions or triggers — **not** direct client writes for protected operations.

---

## Function Catalog

| Function | Description |
|----------|-------------|
| `createProduct` | Create product with validation |
| `updateProduct` | Update non-price product fields |
| `changeProductPrice` | Update selling price + audit log |
| `generateInternalBarcode` | Generate unique internal barcode |
| `createPurchaseOrder` | Create PO with line items |
| `updatePurchaseOrderStatus` | Transition PO status |
| `receiveDelivery` | Process delivery receiving, update stock |
| `createSale` | Complete POS transaction |
| `applyPromo` | Calculate promo discount for cart |
| `deductStockFromSale` | Called within `createSale` transaction |
| `createDisposal` | Record disposal + deduct stock |
| `deductStockFromDisposal` | Called within `createDisposal` transaction |
| `createStockAdjustment` | Submit adjustment request |
| `approveStockAdjustment` | Approve and apply adjustment |
| `updateCriticalStock` | Recompute critical stock denormalized docs |
| `updateDashboardStats` | Refresh aggregated dashboard metrics |
| `createAuditLog` | Write audit trail entry |
| `sendReceiptEmail` | Email receipt to customer |
| `sendReceiptSms` | SMS receipt to customer |

---

## Sensitive Functions

These **must always** run through Cloud Functions. Security rules should block direct client writes to affected fields.

| Function | Protected operations |
|----------|---------------------|
| `changeProductPrice` | `sellingPrice`, audit log |
| `createSale` | Stock deduction, sale record, stats |
| `receiveDelivery` | Stock increase, delivery receipt, PO status |
| `createDisposal` | Stock deduction, disposal record |
| `approveStockAdjustment` | Stock change, movement record |

---

## `receiveDelivery`

```
Input:  purchaseOrderId, items[{ productId, receivedQty, damagedQty?, expiryDate?, remarks? }]
Auth:   Cashier, Store Manager, Admin (branch must match)

Steps:
  1. Validate user role and branch
  2. Load purchase order
  3. For each item:
       acceptedQty = receivedQty - (damagedQty ?? 0)
       missingQty  = expectedQty - receivedQty
  4. Batch write:
       - Create deliveryReceipts document
       - Increment product currentStock by acceptedQty
       - Create stockMovements (type: DELIVERY_RECEIVED)
  5. Update purchase order status (PARTIALLY_RECEIVED | RECEIVED)
  6. Call updateCriticalStock, updateDashboardStats
  7. Return delivery receipt ID
```

---

## `createSale`

```
Input:  branchId, items[{ productId, quantity }], paymentMethod, promoIds?
Auth:   Cashier, Store Manager, Admin

Steps:
  1. Validate stock availability per item
  2. Apply promos (applyPromo)
  3. Transaction:
       - Deduct currentStock per item
       - Create stockMovements (type: SALE)
       - Create sales document
  4. updateCriticalStock, updateDashboardStats
  5. Return sale ID + receipt data
```

---

## `createDisposal`

```
Input:  productId, quantity, reason, remarks?, photoUrl?
Auth:   Cashier, Store Manager, Admin

Steps:
  1. Validate quantity <= currentStock
  2. Transaction:
       - Decrement currentStock
       - Create disposals document
       - Create stockMovements (type: DISPOSAL, quantityChange: -quantity)
  3. updateCriticalStock, updateDashboardStats
```

---

## `changeProductPrice`

```
Input:  productId, newPrice
Auth:   Owner, Admin (Store Manager if canChangePrice)

Steps:
  1. Validate permission
  2. Load current price
  3. Update product.sellingPrice
  4. createAuditLog({ action: "PRICE_CHANGE", previousValue, newValue })
```

---

## Error Handling

All callable functions should return structured errors:

```typescript
interface FunctionError {
  code: "permission-denied" | "not-found" | "invalid-argument" | "failed-precondition";
  message: string;
}
```

Common `failed-precondition` cases:

- Insufficient stock for sale
- Disposal quantity exceeds stock
- PO already fully received
- User inactive or wrong branch

---

## Deployment Layout

```
functions/
├── src/
│   ├── index.ts              # Export all functions
│   ├── products/
│   ├── purchaseOrders/
│   ├── deliveries/
│   ├── sales/
│   ├── disposals/
│   ├── stock/
│   ├── promos/
│   ├── audit/
│   ├── notifications/
│   └── utils/
│       ├── auth.ts           # Role / permission checks
│       ├── db.ts             # Batch helpers
│       └── stock.ts          # Stock movement helpers
├── package.json
└── tsconfig.json
```
