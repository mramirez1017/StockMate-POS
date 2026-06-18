package com.stockmate.pos.data.models

data class SaleItem(
    val productId: String = "",
    val productName: String = "",
    val quantity: Int = 0,
    val unitPrice: Double = 0.0,
    val discount: Double = 0.0,
    val lineTotal: Double = 0.0,
    val promoId: String? = null,
)

data class SalePayment(
    val method: String = "CASH",
    val amount: Double = 0.0,
    val reference: String? = null,
)

data class Sale(
    val id: String = "",
    val storeId: String = "",
    val branchId: String = "",
    val cashierId: String = "",
    val cashierName: String = "",
    val items: List<SaleItem> = emptyList(),
    val subtotal: Double = 0.0,
    val discount: Double = 0.0,
    val manualDiscount: Double = 0.0,
    val manualDiscountReason: String? = null,
    val pwdSeniorDiscountAmount: Double = 0.0,
    val tax: Double = 0.0,
    val total: Double = 0.0,
    val paymentMethod: String = "CASH",
    val payments: List<SalePayment> = emptyList(),
    val paymentReference: String? = null,
    val amountTendered: Double? = null,
    val changeGiven: Double? = null,
    val customerEmail: String? = null,
    val customerPhone: String? = null,
    val status: SaleStatus = SaleStatus.COMPLETED,
    val createdAt: Long = 0L,
)

data class CartItem(
    val product: Product,
    val quantity: Int,
) {
    val lineTotal: Double get() = product.sellingPrice * quantity
}

data class ParkedSaleItem(
    val productId: String = "",
    val productName: String = "",
    val quantity: Int = 0,
    val unitPrice: Double = 0.0,
)

/** A held / suspended cart that can be resumed later. */
data class ParkedSale(
    val id: String = "",
    val branchId: String = "",
    val label: String = "",
    val items: List<ParkedSaleItem> = emptyList(),
    val note: String? = null,
    val customerName: String? = null,
    val itemCount: Int = 0,
    val estimatedTotal: Double = 0.0,
    val parkedBy: String = "",
    val parkedByName: String = "",
    val createdAt: Long = 0L,
)
