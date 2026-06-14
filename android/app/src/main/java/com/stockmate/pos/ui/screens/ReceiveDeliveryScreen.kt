package com.stockmate.pos.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.EmptyState
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.SuccessText
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
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        SuccessText(uiState.successMessage)
                        ErrorText(uiState.error)
                    }
                    items(uiState.purchaseOrders, key = { it.id }) { po ->
                        ElevatedCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpenChecklist(po.id) },
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(po.poNumber, style = MaterialTheme.typography.titleMedium)
                                Text("Expected: ${po.expectedDeliveryDate}")
                                Text("Status: ${po.status.name.replace('_', ' ')}")
                                Text("Items: ${po.items.size}")
                            }
                        }
                    }
                }
            }
        }
    }
}
