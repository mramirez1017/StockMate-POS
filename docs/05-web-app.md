# Web App — Pages and Functions

React + TypeScript admin application.

---

## 6.1 Login Page

| Function | Description |
|----------|-------------|
| Google Sign-In | Firebase Auth |
| Check user role | Load user doc, validate role |
| Redirect to dashboard | On success |
| Block inactive users | Show error if `status !== ACTIVE` |

---

## 6.2 Dashboard Page

### All Roles (scoped by branch where applicable)

- Today sales
- Today transactions
- Critical stocks
- Low stocks
- Pending deliveries
- Partially received deliveries
- Expired / disposed items (recent)
- Recent sales
- Top-selling products

### Admin Only

- Profit
- Supplier cost summary
- Inventory value
- All branch performance comparison

> Cashier and store users **do not** see supplier cost or profit.

---

## 6.3 Products Page

| Function | Description |
|----------|-------------|
| Add product | Create with required fields |
| Edit product | Update fields (price via Cloud Function) |
| Archive product | Set status `INACTIVE` |
| Search product | By name, barcode, SKU |
| Filter by category | Category dropdown |
| Upload image | Firebase Storage |
| Set selling price | Triggers `changeProductPrice` + audit log |
| Set reorder / critical level | Direct or inherited from category |
| Generate internal barcode | Cloud Function |
| Generate product QR | Client-side or function |
| Print barcode label | Label printer integration |

---

## 6.4 Categories Page

| Function | Description |
|----------|-------------|
| Add / edit / archive category | CRUD |
| Set default critical level | Applied to new products |
| Set default reorder level | Applied to new products |
| Mark expiry date required | Category flag `requiresExpiryDate` |

---

## 6.5 Suppliers Page

| Function | Description |
|----------|-------------|
| Add / edit / archive supplier | CRUD |
| View supplier products | Filter products by `supplierId` |
| View supplier delivery history | Delivery receipts |
| View supplier purchase orders | PO list filtered by supplier |

---

## 6.6 Purchase Orders Page

| Function | Description |
|----------|-------------|
| Create purchase order | Supplier, branch, items, date |
| Select supplier / branch | Dropdowns |
| Add products + expected quantities | Line items |
| Set expected delivery date | Date picker |
| Change status | See statuses below |
| Print purchase order | PDF / print view |
| Export purchase order | CSV / PDF |

### PO Statuses

| Status | Meaning |
|--------|---------|
| `DRAFT` | Not yet sent to supplier |
| `ORDERED` | Placed with supplier |
| `IN_TRANSIT` | Shipped, not yet received |
| `PARTIALLY_RECEIVED` | Some items received |
| `RECEIVED` | Fully received |
| `CANCELLED` | Cancelled |

---

## 6.7 Upcoming Deliveries Page

| Function | Description |
|----------|-------------|
| View deliveries expected today | Filter by date |
| View upcoming deliveries | Future POs |
| Open delivery checklist | Navigate to checklist |
| Monitor branch receiving | Status per branch |
| View delivery variance | Expected vs received |

---

## 6.8 Delivery Checklist Page

| Function | Description |
|----------|-------------|
| Show expected items | From linked PO |
| Input received quantity | Per line |
| Input damaged quantity | Per line, optional |
| Input expiry date | Optional |
| Input remarks | Optional |
| Submit receiving | Calls `receiveDelivery` |
| Print delivery receipt | After submit |

### Checklist Example

```
Coke 1.5L
  Expected: 50
  Received: [48]
  Damaged:  [2]
  Expiry Date: (optional)
  Remarks: (optional)
```

---

## 6.9 Inventory Page

| Function | Description |
|----------|-------------|
| View current stock | All products, branch filter |
| Search product stock | Name, barcode |
| Filter by category | |
| View stock movement history | Per product |
| View low stock | `currentStock <= reorderLevel` |
| View critical stock | `currentStock <= criticalLevel` |
| Manual stock adjustment request | Creates pending adjustment |

---

## 6.10 Stock Disposal Page

| Function | Description |
|----------|-------------|
| Scan / search product | |
| Input disposed quantity | Must be ≤ current stock |
| Select reason | See disposal reasons |
| Add remarks | Optional |
| Submit disposal | Calls `createDisposal` |
| Auto-deduct stock | Via Cloud Function |
| Create disposal report | Logged in `disposals` collection |

### Disposal Reasons

Expired · Damaged · Spoiled · Lost · Returned to supplier · Other

---

## 6.11 Promo Page

| Function | Description |
|----------|-------------|
| Create / edit promo | |
| Activate / deactivate | Status toggle |
| Set promo date range | Start / end |
| Set product or category scope | |
| Set discount | By promo type |
| View promo usage | From sales / audit |

### Promo Types

- Percentage discount
- Fixed discount
- Promo price
- Buy X Get Y *(optional for later)*

---

## 6.12 Sales Page

| Function | Description |
|----------|-------------|
| View sales | List with filters |
| View receipt | Detail modal |
| Filter by date / cashier / branch | |
| Void / refund | If permitted |
| Export sales report | CSV / PDF |

---

## 6.13 Reports Page

| Report | Access |
|--------|--------|
| Sales report | All roles (branch scoped) |
| Product sales report | All roles |
| Critical stock report | All roles |
| Low stock report | All roles |
| Delivery report | Manager+ |
| Delivery variance report | Manager+ |
| Disposal / expired report | Manager+ |
| Promo usage report | Admin |
| Cashier report | Manager+ |
| Branch report | Admin |
| Inventory value report | Admin |
| Profit report | **Admin only** |

---

## 6.14 Users Page

| Function | Description |
|----------|-------------|
| Add user | Email, role, branch |
| Assign role | Owner, Admin, Store Manager, Cashier |
| Assign branch | |
| Activate / deactivate | Status |
| Set permissions | Custom permission flags |

---

## 6.15 Settings Page

| Section | Description |
|---------|-------------|
| Store profile | Name, logo, address |
| Branch settings | Per-branch config |
| Receipt settings | Header, footer, format |
| Printer settings | Default printers |
| Tax settings | Tax rate, inclusive/exclusive |
| Payment methods | Cash, card, etc. |
| Notification settings | Email / push alerts |
