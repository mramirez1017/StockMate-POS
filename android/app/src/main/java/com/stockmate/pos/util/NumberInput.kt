package com.stockmate.pos.util

object NumberInput {
    fun normalizeWholeDigits(digits: String): String {
        if (digits.isEmpty()) return ""
        val stripped = digits.replace(Regex("^0+(?=\\d)"), "")
        if (stripped.isNotEmpty()) return stripped
        return if (digits.contains('0')) "0" else ""
    }

    fun sanitizeIntegerInput(value: String): String {
        return normalizeWholeDigits(value.filter { it.isDigit() })
    }

    fun parseInteger(value: String, fallback: Int = 0): Int {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return fallback
        return trimmed.toIntOrNull()?.takeIf { it >= 0 } ?: fallback
    }

    fun sanitizeMoneyInput(value: String): String {
        var cleaned = value.filter { it.isDigit() || it == '.' }
        val dotIndex = cleaned.indexOf('.')
        if (dotIndex == -1) return normalizeWholeDigits(cleaned)

        val whole = normalizeWholeDigits(cleaned.substring(0, dotIndex))
        val fraction = cleaned.substring(dotIndex + 1).replace(".", "").take(2)
        return if (fraction.isEmpty() && cleaned.endsWith(".")) {
            "${whole.ifEmpty { "0" }}."
        } else {
            "${whole.ifEmpty { "0" }}.$fraction"
        }
    }
}
