# Required Fields

Validation rules for web app forms and Cloud Function payloads.

---

## Product

### Required

| Field | Type | Notes |
|-------|------|-------|
| Product Name | string | |
| Category | reference | `categoryId` |
| Selling Price | number | |
| Unit | string | e.g. pcs, kg, L |
| Reorder Level | number | Low stock threshold |
| Critical Level | number | Critical stock threshold |
| Status | enum | `ACTIVE` \| `INACTIVE` |

### Optional

| Field | Type |
|-------|------|
| Barcode | string |
| Internal Barcode | string |
| SKU | string |
| Description | string |
| Brand | string |
| Supplier | reference (`supplierId`) |
| Supplier Cost | number |
| Product Image | URL / storage path |
| Expiry Date | string (ISO date) |
| Remarks | string |

---

## Category

### Required

| Field | Type |
|-------|------|
| Category Name | string |
| Status | enum (`ACTIVE` \| `INACTIVE`) |

### Optional

| Field | Type |
|-------|------|
| Description | string |
| Default Reorder Level | number |
| Default Critical Level | number |
| Requires Expiry Date | boolean |

When `requiresExpiryDate` is true on a category, the delivery checklist should prompt for expiry date (still optional at system level unless enforced in UI).

---

## Supplier

### Required

| Field | Type |
|-------|------|
| Supplier Name | string |
| Status | enum (`ACTIVE` \| `INACTIVE`) |

### Optional

| Field | Type |
|-------|------|
| Contact Person | string |
| Phone Number | string |
| Email | string |
| Address | string |
| Notes | string |

---

## Purchase Order

### Required

| Field | Type |
|-------|------|
| Supplier | reference |
| Branch | reference |
| Expected Delivery Date | string (ISO date) |
| At least one product | array |
| Expected Quantity per product | number (per line item) |

### Optional

| Field | Type |
|-------|------|
| PO Number | string (auto-generated if omitted) |
| Supplier Reference Number | string |
| Notes | string |
| Attachment | file URL |
| Expected Cost | number |

---

## Delivery Receiving

### Required

| Field | Type |
|-------|------|
| Purchase Order | reference |
| Product | reference (per line) |
| Received Quantity | number |
| Received By | user reference |
| Received Date | timestamp |

### Optional

| Field | Type |
|-------|------|
| Damaged Quantity | number (default 0) |
| Expiry Date | string |
| Remarks | string |
| Photo Proof | file URL |
| Supplier Delivery Number | string |

### Computed (not user input)

| Field | Formula |
|-------|---------|
| Accepted Qty | `receivedQty - damagedQty` |
| Missing Qty | `expectedQty - receivedQty` |

---

## Promo

### Required

| Field | Type |
|-------|------|
| Promo Name | string |
| Promo Type | enum |
| Discount Value | number |
| Start Date | string |
| End Date | string |
| Applicable Product or Category | reference |
| Status | enum (`ACTIVE` \| `INACTIVE`) |

### Promo Types

- `PERCENTAGE` — percentage discount
- `FIXED` — fixed amount off
- `PROMO_PRICE` — override price
- `BUY_X_GET_Y` — optional for later phase

### Optional

| Field | Type |
|-------|------|
| Minimum Quantity | number |
| Minimum Spend | number |
| Usage Limit | number |
| Branch-specific | reference (`branchId`) |

---

## User

### Required

| Field | Type |
|-------|------|
| Full Name | string |
| Email | string |
| Role | enum (`OWNER` \| `ADMIN` \| `STORE_MANAGER` \| `CASHIER`) |
| Branch | reference |
| Status | enum (`ACTIVE` \| `INACTIVE`) |

### Optional

| Field | Type |
|-------|------|
| Phone Number | string |
| Custom Permissions | object |

### Custom Permissions Object

```typescript
interface CustomPermissions {
  canVoidSale?: boolean;
  canApproveStockAdjustment?: boolean;
  canViewSupplierCost?: boolean;
  canCreatePurchaseRequest?: boolean;
  canChangePrice?: boolean;
}
```
