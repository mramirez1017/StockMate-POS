package com.stockmate.pos.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.PurchaseOrder
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.EmptyState
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.components.PoStatusPill
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.SuccessText
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.viewmodel.DeliveryViewModel

@Composable
fun ReceiveDeliveryScreen(
    user: User,
    viewModel: DeliveryViewModel,
    onOpenChecklist: (String) -> Unit,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(user.id) {
        viewModel.loadPurchaseOrders(user)
    }

    StockMateScaffold(
        topBar = { StockMateTopBar(title = "Receive Delivery", onBack = onBack) },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                uiState.isLoading -> LoadingBox()
                uiState.purchaseOrders.isEmpty() -> EmptyState("No upcoming deliveries")
                else -> LazyColumn(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    item {
                        SuccessText(uiState.successMessage)
                        ErrorText(uiState.error)
                    }
                    items(uiState.purchaseOrders, key = { it.id }) { po ->
                        DeliveryCard(po = po, onClick = { onOpenChecklist(po.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun DeliveryCard(po: PurchaseOrder, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        color = StockMateColors.Panel,
        border = BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),
        shadowElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(modifier = Modifier.size(44.dp), shape = RoundedCornerShape(12.dp), color = StockMateColors.Sky100) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.LocalShipping, contentDescription = null, tint = StockMateColors.Sky600, modifier = Modifier.size(22.dp))
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        po.poNumber,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = StockMateColors.Slate900,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    PoStatusPill(po.status)
                }
                Spacer(Modifier.height(6.dp))
                MetaRow(Icons.Default.CalendarMonth, "Expected: ${po.expectedDeliveryDate.ifBlank { "—" }}")
                Spacer(Modifier.height(2.dp))
                MetaRow(Icons.Default.Inventory2, "${po.items.size} item${if (po.items.size == 1) "" else "s"}")
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = StockMateColors.Slate400,
            )
        }
    }
}

@Composable
private fun MetaRow(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(icon, contentDescription = null, tint = StockMateColors.Slate400, modifier = Modifier.size(14.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = StockMateColors.Slate500)
    }
}
