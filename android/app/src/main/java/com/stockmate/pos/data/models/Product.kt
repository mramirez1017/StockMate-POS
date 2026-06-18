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
    /** Pieces per purchase pack (e.g. 50 for a box of 50). Stock stays in pieces. */
    val unitsPerPack: Int? = null,
    /** Label for the pack, e.g. "box". */
    val packLabel: String? = null,
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
    val currentStock: Int = 0,
    val categoryName: String? = null,
) {
    val isCritical: Boolean get() = currentStock <= criticalLevel

    /** True when the product is purchased in multi-piece packs. */
    val isPacked: Boolean get() = (unitsPerPack ?: 0) > 1

    /** Pack label or "box" fallback. */
    val packLabelOrDefault: String get() = packLabel?.takeIf { it.isNotBlank() } ?: "box"

    /**
     * Whole-box breakdown, e.g. "10 boxes" or "10 boxes + 30 pcs".
     * Empty when there isn't at least one full box.
     */
    fun packBreakdown(pieces: Int): String {
        val upp = unitsPerPack ?: return ""
        if (upp <= 1) return ""
        val packs = pieces / upp
        if (packs == 0) return ""
        val loose = pieces - packs * upp
        val label = packLabelOrDefault
        val plural = if (packs == 1) label else "${label}s"
        val parts = mutableListOf<String>()
        parts.add("$packs $plural")
        if (loose > 0) parts.add("$loose pcs")
        return parts.joinToString(" + ")
    }

    /** Pack ratio, e.g. "200 pcs/box". Empty when not packed. */
    val packRate: String get() = if (isPacked) "$unitsPerPack pcs/$packLabelOrDefault" else ""

    /**
     * Secondary stock note showing how many boxes/packs are left:
     * "= 10 boxes (+ 30 pcs)" when there's at least one full box, otherwise the
     * fractional count "≈ 0.5 box left". Empty when not packed.
     */
    fun packNote(pieces: Int): String {
        val upp = unitsPerPack ?: return ""
        if (upp <= 1) return ""
        val label = packLabelOrDefault
        val packs = pieces / upp
        if (packs >= 1) {
            val loose = pieces - packs * upp
            val plural = if (packs == 1) label else "${label}s"
            val parts = mutableListOf("$packs $plural")
            if (loose > 0) parts.add("$loose pcs")
            return "= ${parts.joinToString(" + ")}"
        }
        if (pieces <= 0) return "0 ${label}s"
        val fraction = Math.round((pieces.toDouble() / upp) * 100) / 100.0
        val fractionStr =
            if (fraction == fraction.toLong().toDouble()) fraction.toLong().toString()
            else fraction.toString()
        return "≈ $fractionStr ${label}s left"
    }
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
