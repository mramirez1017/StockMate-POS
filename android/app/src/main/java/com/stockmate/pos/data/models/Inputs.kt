package com.stockmate.pos.data.models

data class CartItemInput(
    val productId: String,
    val quantity: Int,
)

data class CreateSaleResult(
    val saleId: String,
    val sale: Sale,
)

data class ReceiveDeliveryResult(
    val deliveryReceiptId: String,
    val items: List<DeliveryReceiptItem>,
)

data class CreateDisposalResult(
    val disposalId: String,
)

data class CreatePurchaseRequestResult(
    val purchaseRequestId: String,
)
