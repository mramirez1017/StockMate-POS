package com.stockmate.pos.navigation

object NavRoutes {
    const val LOGIN = "login"
    const val HOME = "home"
    const val POS = "pos"
    const val PRODUCT_SEARCH = "product_search"
    const val RECEIVE_DELIVERY = "receive_delivery"
    const val DELIVERY_CHECKLIST = "delivery_checklist/{poId}"
    const val SCAN_PRODUCT = "scan_product"
    const val ASSIGN_BARCODE = "assign_barcode"
    const val STOCK_DISPOSAL = "stock_disposal"
    const val CRITICAL_STOCKS = "critical_stocks"
    const val RECEIPT = "receipt"
    const val RECEIPT_DETAIL = "receipt/{saleId}"
    const val BLUETOOTH_PRINTER = "bluetooth_printer"
    const val NOTIFICATIONS = "notifications"
    const val ACCESS_REQUESTS = "access_requests"
    const val STOCK_TRANSFERS = "stock_transfers"
    const val STOCK_COUNTS = "stock_counts"
    const val MESSAGES = "messages/{poId}"

    fun deliveryChecklist(poId: String) = "delivery_checklist/$poId"
    fun receiptDetail(saleId: String) = "receipt/$saleId"
    fun messages(poId: String) = "messages/$poId"
}
