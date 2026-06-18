package com.stockmate.pos.data.models

/** A single product line on a branch-to-branch transfer. */
data class StockTransferItem(
    val productId: String = "",
    val productName: String = "",
    val quantity: Int = 0,
    val receivedQty: Int? = null,
)

/**
 * Movement of stock between two branches of the same store. Mirrors the web /
 * Cloud Function model. Writes go through the stock-transfer callables.
 */
data class StockTransfer(
    val id: String = "",
    val transferNumber: String = "",
    val fromBranchId: String = "",
    val toBranchId: String = "",
    val status: String = "PENDING_APPROVAL",
    val items: List<StockTransferItem> = emptyList(),
    val notes: String? = null,
    val requestedBy: String = "",
    val requestedByName: String = "",
    val approvedByName: String? = null,
    val dispatchedByName: String? = null,
    val receivedByName: String? = null,
    val rejectedByName: String? = null,
    val rejectReason: String? = null,
    val cancelledByName: String? = null,
    val cancelReason: String? = null,
    val createdAt: Long = 0L,
) {
    val totalUnits: Int get() = items.sumOf { it.receivedQty ?: it.quantity }
}

/** Lightweight branch reference for transfer pickers. */
data class BranchOption(
    val id: String = "",
    val name: String = "",
)
