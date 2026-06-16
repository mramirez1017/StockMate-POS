package com.stockmate.pos.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.POStatus
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.ui.theme.StockMateColors

/**
 * Shared visual building blocks so transaction screens (POS, Deliveries,
 * Disposal, Scan) share one consistent look: product avatars, stock pills,
 * and status pills.
 */

/** Rounded initials tile used as a lightweight product/entity avatar. */
@Composable
fun ProductAvatar(name: String, size: Dp = 44.dp) {
    val initials = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }.let {
        when {
            it.isEmpty() -> "?"
            it.size == 1 -> it[0].take(2).uppercase()
            else -> "${it.first().first()}${it[1].first()}".uppercase()
        }
    }
    Surface(modifier = Modifier.size(size), shape = RoundedCornerShape(12.dp), color = StockMateColors.Brand50) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                initials,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = StockMateColors.Brand700,
            )
        }
    }
}

/** Small colored pill (used for stock levels and statuses). */
@Composable
fun TonePill(label: String, background: Color, foreground: Color) {
    Surface(shape = RoundedCornerShape(6.dp), color = background) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = foreground,
        )
    }
}

/** Stock-level pill colored by reorder/critical thresholds. */
@Composable
fun StockPill(product: Product) {
    val (bg, fg) = when {
        product.currentStock <= product.criticalLevel -> StockMateColors.Rose100 to StockMateColors.Red600
        product.currentStock <= product.reorderLevel -> StockMateColors.Amber100 to StockMateColors.Amber600
        else -> StockMateColors.Brand100 to StockMateColors.Brand700
    }
    TonePill("Stock: ${product.currentStock}", bg, fg)
}

/** Purchase-order status pill with brand-consistent colors. */
@Composable
fun PoStatusPill(status: POStatus) {
    val (bg, fg) = when (status) {
        POStatus.DRAFT -> StockMateColors.Slate100 to StockMateColors.Slate600
        POStatus.ORDERED -> StockMateColors.Sky100 to StockMateColors.Sky600
        POStatus.IN_TRANSIT -> StockMateColors.Violet100 to StockMateColors.Violet600
        POStatus.PARTIALLY_RECEIVED -> StockMateColors.Amber100 to StockMateColors.Amber600
        POStatus.RECEIVED -> StockMateColors.Brand100 to StockMateColors.Brand700
        POStatus.COMPLETED -> StockMateColors.Brand100 to StockMateColors.Brand700
        POStatus.CANCELLED -> StockMateColors.Rose100 to StockMateColors.Red600
    }
    TonePill(status.name.replace('_', ' '), bg, fg)
}
