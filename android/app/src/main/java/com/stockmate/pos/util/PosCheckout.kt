package com.stockmate.pos.util

object PosCheckout {
    const val PWD_SENIOR_DISCOUNT_RATE = 0.2

    data class SaleEstimate(
        val pwdSeniorDiscountAmount: Double,
        val total: Double,
        val afterPromo: Double,
    )

    fun roundMoney(n: Double): Double = kotlin.math.round(n * 100) / 100.0

    fun tenderCoversTotal(tendered: Double, totalDue: Double): Boolean {
        return kotlin.math.round(tendered * 100) >= kotlin.math.round(totalDue * 100)
    }

    /** Selling price is the final price — no separate tax added at checkout. */
    fun estimateSaleTotal(
        subtotal: Double,
        pwdOrSenior: Boolean,
        promoDiscount: Double = 0.0,
    ): SaleEstimate {
        val afterPromo = subtotal - promoDiscount
        val pwdSeniorDiscountAmount = if (pwdOrSenior) {
            roundMoney(afterPromo * PWD_SENIOR_DISCOUNT_RATE)
        } else {
            0.0
        }
        val total = roundMoney(afterPromo - pwdSeniorDiscountAmount)
        return SaleEstimate(
            pwdSeniorDiscountAmount = pwdSeniorDiscountAmount,
            total = total,
            afterPromo = afterPromo,
        )
    }

    fun sanitizeMoneyInput(value: String): String = NumberInput.sanitizeMoneyInput(value)

    fun parseMoney(value: String): Double? {
        val trimmed = value.trim()
        if (trimmed.isEmpty() || trimmed == ".") return null

        var normalized = if (trimmed.endsWith(".")) trimmed.dropLast(1) else trimmed
        if (normalized.isEmpty()) return null
        if (!Regex("^\\d+(\\.\\d{1,2})?$").matches(normalized)) return null

        val n = normalized.toDoubleOrNull() ?: return null
        return if (n.isFinite() && n >= 0) roundMoney(n) else null
    }

    fun formatMoneyForInput(value: Double): String {
        val rounded = roundMoney(value)
        return if (rounded == rounded.toLong().toDouble()) {
            rounded.toLong().toString()
        } else {
            String.format("%.2f", rounded)
        }
    }
}
