package com.stockmate.pos.data.models

/** Elevated permissions branch staff can request; admins review them. Mirrors the web REQUESTABLE list. */
enum class RequestablePermission(val key: String, val label: String, val description: String) {
    CAN_APPROVE_STOCK_ADJUSTMENT(
        "canApproveStockAdjustment",
        "Approve Stock Adjustment",
        "Approve inventory count corrections.",
    ),
    CAN_VIEW_SUPPLIER_COST(
        "canViewSupplierCost",
        "View Supplier Cost",
        "See product cost / margin information.",
    ),
    CAN_CREATE_PURCHASE_REQUEST(
        "canCreatePurchaseRequest",
        "Create Purchase Request",
        "Raise requests to restock products.",
    ),
    CAN_CHANGE_PRICE(
        "canChangePrice",
        "Change Price",
        "Edit product selling prices.",
    );

    companion object {
        fun labelFor(key: String): String = entries.find { it.key == key }?.label ?: key
    }
}

/** A staff member's request for an elevated permission, awaiting admin review. */
data class PermissionRequest(
    val id: String,
    val permission: String,
    val reason: String?,
    val status: String,
    val requestedBy: String,
    val requestedByName: String,
    val branchId: String?,
    val createdAt: Long,
) {
    val permissionLabel: String get() = RequestablePermission.labelFor(permission)
}
