# Roles & Permissions

## Roles

| Role | Primary platform | Scope |
|------|------------------|-------|
| **Owner / Admin** | Web (full access) | All branches, all settings |
| **Store Manager** | Web + Android | Assigned branch |
| **Cashier** | Android (primary) | Assigned branch, daily operations |

---

## Owner / Admin

### Can Manage

- Products
- Categories
- Branches
- Users
- Prices
- Promos
- Suppliers
- Purchase orders
- Deliveries
- Reports
- Supplier cost
- Settings

### Can See

- Selling price
- Supplier cost
- Profit
- Inventory value
- Sales reports
- Delivery reports
- All branch performance (dashboard)

---

## Store Manager

### Can Do (Branch Operations)

- POS
- Receive deliveries
- Verify delivered quantity
- View branch inventory
- Tag expired / disposed items
- Print receipts
- Print delivery receipt
- View critical stocks
- Create purchase request
- View branch sales

### Optional Permissions

These are granted per user via custom permissions:

| Permission | Description |
|------------|-------------|
| `canVoidSale` | Void or refund a completed sale |
| `canApproveStockAdjustment` | Approve manual stock adjustments |
| `canViewSupplierCost` | See supplier cost on products and reports |
| `canCreatePurchaseRequest` | Create purchase requests from critical stock |
| `canChangePrice` | Change selling price (otherwise Admin only) |

---

## Cashier

### Can Do (Daily Store Work)

- POS
- Scan barcode
- Search product
- Checkout
- Print receipt
- Receive delivery
- Verify quantity
- Tag expired / disposed items
- View branch stock
- View critical stocks

### Cannot Normally Do

- Change selling price
- View supplier cost
- View profit
- Manage users
- Delete products
- Create promos
- Edit business settings
- Void sales (unless granted)
- Approve stock adjustments

---

## Permission Matrix

| Capability | Owner/Admin | Store Manager | Cashier |
|------------|:-----------:|:-------------:|:-------:|
| Manage products | ✓ | — | — |
| Change selling price | ✓ | Optional | — |
| View supplier cost | ✓ | Optional | — |
| View profit | ✓ | — | — |
| POS / checkout | ✓ | ✓ | ✓ |
| Receive delivery | ✓ | ✓ | ✓ |
| Stock disposal | ✓ | ✓ | ✓ |
| Void sale | ✓ | Optional | — |
| Approve stock adjustment | ✓ | Optional | — |
| Manage users | ✓ | — | — |
| Reports (all) | ✓ | Branch only | — |
| Settings | ✓ | — | — |

---

## Authentication Flow

1. User signs in with Google (Firebase Auth)
2. System loads user document from `stores/{storeId}/users/{userId}`
3. Role and branch are validated
4. Inactive users are blocked
5. UI and API access are filtered by role and custom permissions

See [Web App — Login](05-web-app.md#61-login-page) and [Android App — Login](06-android-app.md#71-login-screen).
