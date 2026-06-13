package com.stockmate.pos.data.models

data class Store(
    val id: String = "",
    val name: String = "",
    val logoUrl: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val taxRate: Double = 0.0,
    val taxInclusive: Boolean = false,
    val currency: String = "PHP",
    val receiptHeader: String? = null,
    val receiptFooter: String? = null,
    val paymentMethods: List<String> = listOf("CASH", "CARD", "GCASH"),
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
)

data class DashboardStats(
    val todaySales: Double = 0.0,
    val todayTransactions: Int = 0,
    val criticalStockCount: Int = 0,
    val lowStockCount: Int = 0,
    val pendingDeliveries: Int = 0,
    val partialDeliveries: Int = 0,
    val inventoryValue: Double = 0.0,
    val todayProfit: Double = 0.0,
    val updatedAt: Long = 0L,
)
