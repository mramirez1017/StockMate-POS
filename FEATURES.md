# StockMate POS — Feature Documentation

A complete reference of every feature in StockMate POS, a cloud-based, multi-branch
inventory and point-of-sale platform. The system spans a **React web console**, a
**Kotlin/Jetpack Compose Android app**, and a **Firebase Cloud Functions** backend, all
sharing a single Firestore database and a common set of TypeScript types.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Roles & Access Control](#2-roles--access-control)
3. [Permissions System](#3-permissions-system)
4. [Web App Features](#4-web-app-features)
5. [Android App Features](#5-android-app-features)
6. [Real-Time Communication & Notifications](#6-real-time-communication--notifications)
7. [Procurement & Quotation Lifecycle](#7-procurement--quotation-lifecycle)
8. [Backend (Cloud Functions)](#8-backend-cloud-functions)
9. [Data Model](#9-data-model)
10. [Security](#10-security)
11. [Technology Stack](#11-technology-stack)

---

## 1. Platform Overview

StockMate POS lets a business operate a multi-branch retail operation from one place:

- **Stores** contain one or more **branches**. Products form a store-wide catalog while
  stock is tracked **per branch**.
- The **web console** is for administration, procurement, reporting, and oversight.
- The **Android app** is the in-store tool for cashiers and managers — selling,
  receiving deliveries, disposing stock, and scanning products.
- A **Firebase backend** runs all sensitive operations (sales, stock changes, price
  changes, approvals) so business rules can't be bypassed by a client.
- Data syncs in **real time** across every device using Firestore listeners.

---

## 2. Roles & Access Control

There are four roles, each with a tailored experience:

| Role | Scope | Primary surface |
|------|-------|-----------------|
| **Platform Owner** | All stores | Web (multi-store analytics, store/branch management) |
| **Admin** | One store, all branches | Web (full management) |
| **Branch / Store Manager** | One assigned branch | Web + Android |
| **Cashier** | One assigned branch | Android (+ POS on web) |

**Route guarding** (web): routes are wrapped in guards — `PlatformOwnerRoute`,
`StoreStaffRoute`, `UserManagementRoute`, and `PosRoute` — so users only ever reach
pages their role permits. Data is **branch-scoped** at the query level: managers and
cashiers only see their own branch's records, while admins/owners see store-wide data.

---

## 3. Permissions System

Beyond roles, branch staff can be granted fine-grained **custom permissions**:

| Permission | What it unlocks |
|------------|-----------------|
| `canVoidSale` | Void / refund a completed sale |
| `canApproveStockAdjustment` | Approve or reject stock adjustments |
| `canViewSupplierCost` | See supplier cost / profit figures |
| `canCreatePurchaseRequest` | Raise purchase requests to admins |
| `canChangePrice` | Change a product's selling price |

There are **two ways** these flags are managed, and both converge on the same data:

### a) Direct editing (admin / platform owner)
On the **Users** page, every branch-staff row has a single **Edit** button that opens one
popup to change the user's **role**, **branch**, **active status**, and **permissions**
together. Saving only sends what actually changed and records an audit-log entry
(`USER_PERMISSIONS_UPDATED`). Backed by the `setUserPermissions` callable, which verifies
the caller is the store's admin (or platform owner) and refuses self-edits and
platform-owner targets.

### b) Request & approval flow (branch staff)
A manager or cashier can **request** an elevated permission from the **Activity** page
("Request access"). The request is routed to admins, who **approve** or **reject** it.
Approval grants the flag instantly; both parties receive in-app notifications
(`PERMISSION_REQUEST`, `PERMISSION_REQUEST_RESOLVED`). Backed by the
`createPermissionRequest` / `approvePermissionRequest` / `rejectPermissionRequest`
callables. All writes go through Cloud Functions — clients cannot write the
`permissionRequests` collection directly.

---

## 4. Web App Features

The web console (React + Vite + Tailwind) has 20+ routes. Highlights by area:

### Dashboard
- KPIs for sales, inventory value, and profit (financials gated by permission).
- **Critical-stock** panel derived from **live branch inventory**, so products created at
  0 stock or below their critical level are always surfaced (not just after a movement).
- Branch selector for admins/owners to scope the whole view.

### Catalog
- **Products** — store-wide catalog with barcodes (incl. generated internal barcodes for
  items without one), pricing, categories, and supplier links.
- **Categories** — organize the catalog.
- **Suppliers** — supplier directory with cost visibility gated by `canViewSupplierCost`.

### Procurement & Deliveries
- **Purchase Orders** — create and track POs through their lifecycle. Admins creating a
  "new request" are routed straight into PO creation.
- **Upcoming Deliveries** — POs awaiting receipt.
- **Delivery Checklist** — per-PO receiving with received/damaged quantities per line item,
  plus a threaded conversation tied to that delivery.

### Inventory
- **Inventory** — live per-branch stock with status (in-stock / low / out).
- **Stock Adjustments** — propose adjustments that route through an approval workflow
  (`canApproveStockAdjustment`); cards are collapsible.
- **Stock Disposal** — record disposed/expired/damaged stock with reasons.

### Sales
- **POS (New Sale)** — full cart and checkout flow with tax, payment methods, and receipts.
- **Promos** — percentage, fixed amount, promo price, and buy-X-get-Y promotions.
- **Sales** — sales history with void/refund (gated by `canVoidSale`, with an
  approval path).

### Reporting & Analytics
- **Reports** — sales, profit, critical stock, disposals, inventory value, and a
  transaction-history table with date-range filtering and per-table scrolling.
- **Analytics** (platform owner) — cross-store metrics.

### Administration
- **Users** — register users, and **Edit** each one (role, branch, status, permissions)
  from a single responsive modal. Admins can't see or deactivate their own account.
- **Branches** — create/deactivate branches within a store.
- **Stores** (platform owner) — create and manage stores.
- **Settings** — store tax rate, receipt configuration, and payment methods.
- **Activity** — procurement timeline, purchase/permission requests, and request detail
  pages with visual lifecycle tracking.

### Cross-cutting UX
- Modern Tailwind theme with consistent iconography via a shared transaction-visual
  registry (icons/colors/labels per transaction type).
- Notification bell with unread badge and deep-linking.
- Responsive layouts for desktop, tablet, and mobile browsers (horizontal-scroll tables,
  stacking filters, compact modals).

---

## 5. Android App Features

The in-store app (Kotlin + Jetpack Compose, MVVM) is search- and scan-first:

### Point of Sale (`PosScreen`)
- **Product search** and **barcode scanning** in one flow — essential because not every
  product has a barcode, so staff can search by name/number too.
- CameraX + ML Kit scanner rendered with `TextureView` (COMPATIBLE mode) so the preview
  respects layout bounds and never overlaps the cart.
- Debounced search that correctly ignores cancelled coroutines (no spurious errors).
- Scrollable, keyboard-aware cart and checkout.

### Other screens
- **Product Search** — standalone cashier lookup with scan toggle and stock pills.
- **Scan Product** — read-only price/stock lookup by scan.
- **Assign Barcode** — attach a barcode to a product (search + scan, polished cards).
- **Receive Delivery / Delivery Checklist** — receive PO items; **scan-to-locate** jumps
  to and highlights the matching line item in the checklist.
- **Stock Disposal** — record disposals with scan support.
- **Critical Stocks** — low-stock list with the ability to raise purchase requests.
- **Receipt** — view/print receipts.
- **Bluetooth Printer** — pair and configure a thermal printer.
- **Messages / Notifications** — threaded chat and in-app notifications.
- **Home** — role-aware dashboard/launcher.

### Android UX details
- Material 3 theming with shared components (avatars, stock pills, scanner box).
- **IME (keyboard) handling**: the bottom bar floats above the keyboard
  (`navigationBars ∪ ime` insets) and no-bottom-bar screens use `imePadding()`, so content
  resizes cleanly when typing.

---

## 6. Real-Time Communication & Notifications

- **Threaded chat** attached to transactions (e.g., a delivery/PO), available on both web
  (`ThreadPanel`) and Android, with branch-scoped queries so the right people see the
  thread.
- **Messaging callables**: `sendMessage`, `unsendMessage`, `markThreadRead`.
- **In-app notifications** with unread badges and deep-links, covering procurement,
  deliveries, approvals, permission requests, and more. Managed via
  `markNotificationRead` / `markAllNotificationsRead`.
- Everything updates live through Firestore `onSnapshot` listeners.

---

## 7. Procurement & Quotation Lifecycle

Requests and orders move through explicit, visualized states:

- **Purchase Requests**: `PENDING → APPROVED / REJECTED → FULFILLED`
  (`createPurchaseRequest`, `approvePurchaseRequest`, `rejectPurchaseRequest`,
  `fulfillPurchaseRequest`).
- **Purchase Orders**: created and advanced via `createPurchaseOrder` /
  `updatePurchaseOrderStatus`, then received via the delivery checklist (`receiveDelivery`).
- **Stock Adjustments** and **Sale Voids** have their own approve/reject workflows.
- The **Activity** page and request-detail views render this lifecycle as a timeline with
  consistent icons and status badges.

---

## 8. Backend (Cloud Functions)

All sensitive logic lives in callable Cloud Functions (TypeScript), grouped by domain:

- **Products**: `createProduct`, `updateProduct`, `changeProductPrice`,
  `updateProductBarcode`, `generateInternalBarcode`.
- **Purchase Orders / Requests**: `createPurchaseOrder`, `updatePurchaseOrderStatus`,
  `createPurchaseRequest`, `updatePurchaseRequest`, `approvePurchaseRequest`,
  `rejectPurchaseRequest`, `fulfillPurchaseRequest`.
- **Deliveries**: `receiveDelivery`.
- **Sales**: `createSale`, `voidSale`, `approveSaleVoid`, `rejectSaleVoid`.
- **Promos**: `applyPromo`.
- **Disposals**: `createDisposal`.
- **Stock**: `createStockAdjustment`, `approveStockAdjustment`, `rejectStockAdjustment`,
  `updateCriticalStock`, `updateDashboardStats`.
- **Messaging**: `sendMessage`, `unsendMessage`, `markThreadRead`,
  `markNotificationRead`, `markAllNotificationsRead`.
- **Users**: `registerUserEmail`, `updateUserRole`, `setUserPermissions`, `claimAccount`,
  `deactivateRegisteredEmail`, `repairPlatformOwnerSession`.
- **Permissions**: `createPermissionRequest`, `approvePermissionRequest`,
  `rejectPermissionRequest`.
- **Stores**: `createStore`, `createBranch`, `deactivateBranch`.
- **Notifications**: `sendReceiptEmail`, `sendReceiptSms`.

Most write operations also create an **audit-log** entry (`createAuditLogEntry`).

---

## 9. Data Model

Primary Firestore collections (under stores where applicable):

`users`, `registeredEmails`, `userStoreIndex`, `platformOwners`, `stores`, `branches`,
`products`, `branchInventory`, `categories`, `suppliers`, `purchaseOrders`,
`purchaseRequests`, `procurementEvents`, `deliveryReceipts`, `sales`, `stockMovements`,
`stockAdjustments`, `disposals`, `promos`, `criticalStocks`, `dashboardStats`,
`dailyReports`, `threads`, `messages`, `notifications`, `permissionRequests`, `auditLogs`.

Shared types are defined once in `shared/types` and consumed by web, functions, and
(conceptually) the Android models.

---

## 10. Security

- **Authentication** via Firebase Auth (Google Sign-In).
- **Firestore Security Rules** enforce store/branch isolation and role checks. Sensitive
  collections (e.g., `permissionRequests`) are **read-only to clients** — all writes go
  through admin-SDK Cloud Functions.
- **Server-side authorization**: each callable re-verifies the caller's role/permissions
  and scope before acting, so the UI is a convenience, not the security boundary.
- **Audit logging** records who changed what and when.

---

## 11. Technology Stack

| Layer | Technology |
|-------|------------|
| Web | React + TypeScript + Vite + Tailwind CSS |
| Android | Kotlin + Jetpack Compose (Material 3, MVVM) |
| Backend | Firebase Cloud Functions (TypeScript) |
| Database | Cloud Firestore (real-time) |
| Auth | Firebase Auth (Google Sign-In) |
| Hosting | Firebase Hosting |
| Scanning | CameraX + ML Kit Barcode |
| Notifications | In-app + email (SMTP) + SMS (Twilio) |

---

*For setup and environment configuration, see [`README.md`](README.md). For the full
product specification, see [`docs/README.md`](docs/README.md).*
