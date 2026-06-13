package com.stockmate.pos.data.models

data class CriticalStock(
    val id: String = "",
    val storeId: String = "",
    val branchId: String = "",
    val productId: String = "",
    val productName: String = "",
    val currentStock: Int = 0,
    val criticalLevel: Int = 0,
    val reorderLevel: Int = 0,
    val suggestedOrderQty: Int = 0,
    val updatedAt: Long = 0L,
)

data class Disposal(
    val id: String = "",
    val storeId: String = "",
    val branchId: String = "",
    val productId: String = "",
    val productName: String = "",
    val quantity: Int = 0,
    val reason: DisposalReason = DisposalReason.OTHER,
    val remarks: String? = null,
    val createdBy: String = "",
    val createdAt: Long = 0L,
)
