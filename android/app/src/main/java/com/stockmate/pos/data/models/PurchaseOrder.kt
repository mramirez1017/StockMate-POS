package com.stockmate.pos.data.models

data class PurchaseOrderItem(
    val productId: String = "",
    val productName: String = "",
    val expectedQty: Int = 0,
    val receivedQty: Int = 0,
    val sellingPrice: Double? = null,
    val expectedCost: Double? = null,
)

data class PurchaseOrder(
    val id: String = "",
    val storeId: String = "",
    val branchId: String = "",
    val supplierId: String = "",
    val poNumber: String = "",
    val supplierReferenceNumber: String? = null,
    val expectedDeliveryDate: String = "",
    val expectedCost: Double? = null,
    val notes: String? = null,
    val status: POStatus = POStatus.DRAFT,
    val items: List<PurchaseOrderItem> = emptyList(),
    val createdBy: String = "",
    val createdAt: Long = 0L,
    val updatedAt: Long? = null,
)

data class DeliveryReceiptItem(
    val productId: String = "",
    val productName: String = "",
    val expectedQty: Int = 0,
    val receivedQty: Int = 0,
    val damagedQty: Int = 0,
    val acceptedQty: Int = 0,
    val missingQty: Int = 0,
    val expiryDate: String? = null,
    val remarks: String? = null,
)

data class ReceiveItemInput(
    val productId: String,
    var receivedQty: String = "",
    var damagedQty: String = "",
    var expiryDate: String = "",
    var remarks: String = "",
)
