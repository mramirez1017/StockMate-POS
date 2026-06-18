package com.stockmate.pos.data.models

data class StockCountItem(
    val productId: String = "",
    val productName: String = "",
    val expectedQty: Int = 0,
    val countedQty: Int? = null,
    val variance: Int? = null,
)

/** A physical stock-take / cycle-count session for one branch. */
data class StockCount(
    val id: String = "",
    val branchId: String = "",
    val countNumber: String = "",
    val scope: String = "FULL",
    val status: String = "IN_PROGRESS",
    val items: List<StockCountItem> = emptyList(),
    val notes: String? = null,
    val totalVarianceUnits: Int? = null,
    val countedItems: Int? = null,
    val varianceItems: Int? = null,
    val startedBy: String = "",
    val startedByName: String = "",
    val startedAt: Long = 0L,
    val completedByName: String? = null,
    val completedAt: Long? = null,
    val cancelledByName: String? = null,
    val cancelledAt: Long? = null,
    val cancelReason: String? = null,
    val createdAt: Long = 0L,
)
