package com.stockmate.pos.data.models

data class Category(
    val id: String = "",
    val storeId: String = "",
    val name: String = "",
    val description: String? = null,
    val status: EntityStatus = EntityStatus.ACTIVE,
)

data class Product(
    val id: String = "",
    val storeId: String = "",
    val name: String = "",
    val categoryId: String = "",
    val unit: String = "pcs",
    val sellingPrice: Double = 0.0,
    val reorderLevel: Int = 0,
    val criticalLevel: Int = 0,
    val status: EntityStatus = EntityStatus.ACTIVE,
    val barcode: String? = null,
    val internalBarcode: String? = null,
    val sku: String? = null,
    val brand: String? = null,
    val description: String? = null,
    val supplierId: String? = null,
    val supplierCost: Double? = null,
    val imageUrl: String? = null,
    val remarks: String? = null,
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
    val currentStock: Int = 0,
    val categoryName: String? = null,
) {
    val isCritical: Boolean get() = currentStock <= criticalLevel
}

data class BranchInventory(
    val id: String = "",
    val storeId: String = "",
    val branchId: String = "",
    val productId: String = "",
    val currentStock: Int = 0,
    val reorderLevel: Int = 0,
    val criticalLevel: Int = 0,
    val expiryDate: String? = null,
    val updatedAt: Long = 0L,
)
