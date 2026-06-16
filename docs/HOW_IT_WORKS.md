# StockMate POS — How It Works

A complete, diagram-driven walkthrough of the StockMate POS platform: how data flows from
**platform owner → admin → branch manager → cashier**, every request/approval loop, and
the end-to-end lifecycle of sales, procurement, deliveries, stock, and permissions.

> Diagrams are written in **Mermaid** and render automatically in GitHub, VS Code/Cursor
> markdown preview, and most documentation tools.

## Contents

1. [System Architecture](#1-system-architecture)
2. [Roles & Hierarchy](#2-roles--hierarchy)
3. [User Onboarding](#3-user-onboarding)
4. [The Point-of-Sale (Sale) Flow](#4-the-point-of-sale-sale-flow)
5. [Void / Refund Flow](#5-void--refund-flow)
6. [Procurement: Request → PO → Delivery](#6-procurement-request--po--delivery)
7. [Purchase Order State Machine](#7-purchase-order-state-machine)
8. [Purchase Request State Machine](#8-purchase-request-state-machine)
9. [Delivery Receiving Flow](#9-delivery-receiving-flow)
10. [Stock Adjustment Flow](#10-stock-adjustment-flow)
11. [Stock Disposal Flow](#11-stock-disposal-flow)
12. [Permissions: Request vs. Direct Edit](#12-permissions-request-vs-direct-edit)
13. [Real-Time Notifications & Messaging](#13-real-time-notifications--messaging)
14. [Data Flow Summary](#14-data-flow-summary)

---

## 1. System Architecture

Two clients talk to one Firebase backend. **All writes that matter go through Cloud
Functions**, which enforce business rules; clients only read directly (constrained by
security rules) and call functions to make changes.

```mermaid
flowchart TB
    subgraph Clients
        WEB["Web Console<br/>(React + Vite + Tailwind)"]
        AND["Android App<br/>(Kotlin + Jetpack Compose)"]
    end

    subgraph Firebase
        AUTH["Firebase Auth<br/>(Google Sign-In)"]
        FN["Cloud Functions<br/>(TypeScript callables)"]
        FS[("Cloud Firestore<br/>real-time DB")]
        RULES{{"Security Rules"}}
        HOST["Firebase Hosting"]
    end

    subgraph External
        SMTP["Email / SMTP"]
        TW["SMS / Twilio"]
    end

    WEB -->|sign in| AUTH
    AND -->|sign in| AUTH
    WEB -->|call functions| FN
    AND -->|call functions| FN
    WEB -. "live reads (onSnapshot)" .-> FS
    AND -. "live reads (snapshots)" .-> FS
    FS --- RULES
    FN -->|writes| FS
    FN --> SMTP
    FN --> TW
    HOST --> WEB

    style FN fill:#e0e7ff,stroke:#6366f1
    style FS fill:#dcfce7,stroke:#16a34a
    style RULES fill:#fee2e2,stroke:#ef4444
```

**Key principle:** the UI is a convenience layer. Every callable re-verifies the caller's
identity, role, custom permissions, and branch scope before writing — so a tampered client
cannot bypass the rules.

---

## 2. Roles & Hierarchy

```mermaid
flowchart TD
    PO["Platform Owner<br/>all stores"]
    A["Admin<br/>one store, all branches"]
    M["Branch Manager<br/>one branch"]
    C["Cashier<br/>one branch"]

    PO -->|creates / manages| A
    A -->|registers & manages| M
    A -->|registers & manages| C
    PO -.->|creates stores & branches| A

    PO -->|surface| POU["Web: multi-store analytics,<br/>stores & branches"]
    A -->|surface| AU["Web: full store management"]
    M -->|surface| MU["Web + Android"]
    C -->|surface| CU["Android (+ POS on web)"]
```

| Capability | Platform Owner | Admin | Manager | Cashier |
|------------|:--:|:--:|:--:|:--:|
| Manage stores / branches | ✅ | branches only | ❌ | ❌ |
| Register users | owners & admins | branch staff | ❌ | ❌ |
| Edit user role/permissions | ✅ | ✅ | ❌ | ❌ |
| Create purchase orders | ✅ | ✅ | ❌ | ❌ |
| Approve requests / adjustments | ✅ | ✅ | ❌ | ❌ |
| Raise purchase request | ✅ (auto-approved) | ✅ (auto-approved) | ✅* | ✅* |
| Sell at POS | ✅ | ✅ | ✅ | ✅ |
| Void a sale | ✅ | ✅ | if granted | if granted |
| Change product price | ✅ | ✅ | if granted | if granted |

\* via the `canCreatePurchaseRequest` permission. Data is always **branch-scoped** for
managers and cashiers.

---

## 3. User Onboarding

Accounts are **invite-based**: an admin/owner registers an email first, then the person
signs in with Google and the system links (claims) their account.

```mermaid
sequenceDiagram
    actor Admin
    participant Web as Web Console
    participant FN as Cloud Functions
    participant FS as Firestore
    actor User as New User
    participant Auth as Firebase Auth

    Admin->>Web: Register user (name, email, role, branch)
    Web->>FN: registerUserEmail(...)
    FN->>FN: Verify caller is admin/owner + role rules
    FN->>FS: Create registeredEmails doc (claimed = false)
    Note over FS: Appears under "Awaiting first sign-in"

    User->>Auth: Sign in with Google (same email)
    User->>FN: claimAccount()
    FN->>FS: Match registeredEmails by email
    FN->>FS: Create users + userStoreIndex; mark claimed = true
    FN-->>User: Profile ready (role, branch, permissions)
```

If the email isn't pre-registered, sign-in is denied access to any store.

---

## 4. The Point-of-Sale (Sale) Flow

A cashier builds a cart (by **search or barcode scan**), then checks out. The server
recomputes everything — never trusting client-sent prices — applies promos, adjusts stock
atomically, and refreshes dashboards.

```mermaid
sequenceDiagram
    actor Cashier
    participant App as POS (Android/Web)
    participant FN as createSale
    participant FS as Firestore

    Cashier->>App: Search / scan products → add to cart
    Cashier->>App: Choose payment (Cash / GCash), tendered amount
    App->>FN: createSale(branchId, items, paymentMethod, ...)
    FN->>FN: requirePosAccess + assertBranchAccess
    FN->>FS: Load ACTIVE promos & products
    FN->>FN: Recompute prices, promo discount, PWD/Senior, total, change
    alt Cash tendered below total
        FN-->>App: Error "amount tendered too low"
    else Valid
        FN->>FS: Transaction: decrement branch stock + write sale
        FN->>FS: Update criticalStocks + dashboardStats
        FN-->>App: saleId + sale
        App->>Cashier: Show receipt (print / email / SMS)
    end
```

**Why server-side:** prices, promo logic, stock decrement, and change calculation all run
in a Firestore transaction so two simultaneous sales can't oversell the same stock.

---

## 5. Void / Refund Flow

Voiding is gated by `canVoidSale`. Staff without the permission must get an approval.

```mermaid
flowchart TD
    Start([Cashier requests void]) --> Has{Has canVoidSale?}
    Has -->|Yes| Direct[voidSale: reverse stock, mark VOIDED]
    Has -->|No| Req[Void request created → notify admins]
    Req --> Dec{Admin decision}
    Dec -->|Approve| AppV["approveSaleVoid:<br/>restock + mark VOIDED"]
    Dec -->|Reject| RejV["rejectSaleVoid:<br/>sale stays COMPLETED"]
    Direct --> Done([Stock restored, audit logged])
    AppV --> Done
    RejV --> End([No change])
```

---

## 6. Procurement: Request → PO → Delivery

Branch staff **request**, admins **order**, the branch **receives**. Admins can also start
their own requests, which are auto-approved.

```mermaid
flowchart TD
    subgraph Branch
        BR["Manager/Cashier:<br/>create purchase request"]
    end
    subgraph Admin
        REV{Review request}
        PO["Create / merge Purchase Order"]
        ORD["Mark ORDERED / IN_TRANSIT"]
    end
    subgraph BranchReceiving
        RC["Delivery checklist:<br/>receive items (received/damaged)"]
    end

    BR -->|notify admins| REV
    REV -->|Reject| RJ["REJECTED<br/>(editable → resubmit)"]
    REV -->|Approve| AP["APPROVED"]
    AP -->|linked into| PO
    PO --> ORD
    ORD -->|notify branch:<br/>incoming delivery| RC
    RC -->|stock added| INV[(Branch inventory updated)]
    RC -->|all items in| CMP["Admin marks COMPLETED"]
    RJ -.->|requester edits| REV

    ADM["Admin-initiated request<br/>(origin = ADMIN)"] -->|auto-APPROVED| PO
```

Requests can be for a **product reorder** or to ask for a **new product / category /
supplier**; the latter is closed via `fulfillPurchaseRequest` once the admin creates it.

---

## 7. Purchase Order State Machine

Transitions are enforced server-side (`VALID_TRANSITIONS`); illegal jumps are rejected.

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> ORDERED
    DRAFT --> CANCELLED
    ORDERED --> IN_TRANSIT
    ORDERED --> PARTIALLY_RECEIVED
    ORDERED --> RECEIVED
    ORDERED --> CANCELLED
    IN_TRANSIT --> PARTIALLY_RECEIVED
    IN_TRANSIT --> RECEIVED
    IN_TRANSIT --> CANCELLED
    PARTIALLY_RECEIVED --> RECEIVED
    PARTIALLY_RECEIVED --> COMPLETED
    PARTIALLY_RECEIVED --> CANCELLED
    RECEIVED --> COMPLETED
    COMPLETED --> [*]
    CANCELLED --> [*]
```

---

## 8. Purchase Request State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> APPROVED: admin approves
    PENDING --> REJECTED: admin rejects
    REJECTED --> PENDING: requester edits & resubmits
    APPROVED --> ORDERED: linked to a PO
    APPROVED --> FULFILLED: new product/category/supplier created
    ORDERED --> [*]
    FULFILLED --> [*]
```

---

## 9. Delivery Receiving Flow

On Android, staff can **scan-to-locate** an item — the checklist scrolls to and highlights
the matching line.

```mermaid
sequenceDiagram
    actor Staff
    participant App as Delivery Checklist
    participant FN as receiveDelivery
    participant FS as Firestore

    Staff->>App: Open incoming PO
    opt Find an item fast
        Staff->>App: Scan barcode
        App->>App: Scroll to + highlight matching line
    end
    Staff->>App: Enter received & damaged qty per item
    Staff->>FN: receiveDelivery(poId, lines)
    FN->>FS: Increment branch stock for received qty
    FN->>FS: Record delivery receipt + stock movements
    FN->>FS: Advance PO (PARTIALLY_RECEIVED / RECEIVED)
    FN-->>App: Updated PO + inventory
```

---

## 10. Stock Adjustment Flow

Adjustments correct stock discrepancies and require approval
(`canApproveStockAdjustment`).

```mermaid
flowchart TD
    A([Staff proposes adjustment]) --> Create[createStockAdjustment → PENDING]
    Create --> Notify[Notify approvers]
    Notify --> D{Approver decision}
    D -->|Approve| Ap["approveStockAdjustment:<br/>apply delta to branch stock<br/>+ stock movement + audit log"]
    D -->|Reject| Rj["rejectStockAdjustment:<br/>no stock change"]
    Ap --> Inv[(Inventory + critical stock refreshed)]
    Rj --> End([Closed, no change])
```

---

## 11. Stock Disposal Flow

```mermaid
sequenceDiagram
    actor Staff
    participant App
    participant FN as createDisposal
    participant FS as Firestore

    Staff->>App: Select product (search/scan), qty, reason
    App->>FN: createDisposal(...)
    FN->>FN: Verify branch access
    FN->>FS: Decrement branch stock + write disposal record
    FN->>FS: Stock movement (type = DISPOSAL) + refresh critical stock
    FN-->>App: Disposal logged
```

---

## 12. Permissions: Request vs. Direct Edit

Two paths, one source of truth. Both write the same permission flags and log an audit
entry.

```mermaid
flowchart LR
    subgraph PathA["A) Branch staff requests access"]
        S1[Staff: Request access on Activity] --> S2[createPermissionRequest → PENDING]
        S2 --> S3{Admin decision}
        S3 -->|Approve| S4["approvePermissionRequest:<br/>grant flag + notify"]
        S3 -->|Reject| S5["rejectPermissionRequest:<br/>notify, no change"]
    end

    subgraph PathB["B) Admin/Owner edits directly"]
        B1["Users page → Edit user"] --> B2["Toggle role / branch / status / permissions"]
        B2 --> B3["setUserPermissions:<br/>write flags + audit log"]
    end

    S4 --> FLAGS[("User permission flags")]
    B3 --> FLAGS
```

**Edit user modal** consolidates role, branch, active status, and the five permission
toggles into a single popup; saving only sends what actually changed.

```mermaid
sequenceDiagram
    actor Admin
    participant Web as Users Page
    participant FN as Cloud Functions
    participant FS as Firestore

    Admin->>Web: Click "Edit" on a user
    Web->>Web: Open modal (role, branch, status, permissions)
    Admin->>Web: Change values → Save changes
    alt role/branch changed
        Web->>FN: updateUserRole(...)
    end
    alt permissions changed
        Web->>FN: setUserPermissions(...)
    end
    alt status changed
        Web->>FS: update user status
    end
    FN->>FS: Update users + registeredEmails + audit log
    FS-->>Web: Live update reflects new access
```

The five grantable flags: **Void Sale**, **Approve Stock Adjustment**, **View Supplier
Cost**, **Create Purchase Request**, **Change Price**.

---

## 13. Real-Time Notifications & Messaging

Every significant action emits an in-app notification and (where relevant) a threaded
message, all delivered live via Firestore listeners.

```mermaid
flowchart TD
    EV["Action occurs<br/>(PO created, request resolved,<br/>permission granted, etc.)"] --> FN[Cloud Function]
    FN --> NOTE["createNotifications<br/>(targets: branch, admins, or specific users)"]
    NOTE --> FS[(notifications collection)]
    FS -. onSnapshot .-> BELL["Notification bell<br/>unread badge + deep-link"]
    BELL -->|click| PAGE["Relevant page<br/>(/requests/:id, /deliveries/:id, ...)"]

    FN --> MSG["Thread message<br/>(sendMessage)"]
    MSG --> FS2[(messages / threads)]
    FS2 -. onSnapshot .-> CHAT["ThreadPanel<br/>(branch-scoped chat)"]
```

Notification kinds include PO created/completed, purchase request & resolution, stock
adjustment, sale void, messages, and permission request / resolved.

---

## 14. Data Flow Summary

```mermaid
flowchart LR
    subgraph Actors
        PO[Platform Owner]
        AD[Admin]
        MG[Manager]
        CA[Cashier]
    end

    PO --> ST[Stores / Branches]
    AD --> CAT[Products / Categories / Suppliers]
    AD --> ORDER[Purchase Orders]
    MG --> REQ[Purchase / Permission Requests]
    CA --> SALE[Sales]
    MG --> RECV[Receive Deliveries]
    CA --> RECV
    MG --> ADJ[Stock Adjustments / Disposals]

    SALE --> INV[("Branch Inventory")]
    RECV --> INV
    ADJ --> INV
    INV --> DASH["Dashboard / Reports / Analytics"]
    ORDER --> RECV
    REQ --> ORDER

    style INV fill:#dcfce7,stroke:#16a34a
    style DASH fill:#e0e7ff,stroke:#6366f1
```

Everything ultimately converges on **branch inventory**, which powers the **dashboard,
reports, and analytics** in real time.

---

*See [`../FEATURES.md`](../FEATURES.md) for the feature catalog and [`../README.md`](../README.md)
for setup. For the full product specification, see [`README.md`](README.md) in this folder.*
