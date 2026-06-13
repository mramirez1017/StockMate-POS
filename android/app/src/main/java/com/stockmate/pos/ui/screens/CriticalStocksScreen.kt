package com.stockmate.pos.ui.screens

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
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.SuccessText
import com.stockmate.pos.viewmodel.CriticalStockViewModel

@Composable
fun CriticalStocksScreen(
    user: User,
    viewModel: CriticalStockViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(user.id) {
        viewModel.load(user)
    }

    Scaffold(
        topBar = { StockMateTopBar(title = "Critical Stocks", onBack = onBack) },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                uiState.isLoading -> LoadingBox()
                uiState.items.isEmpty() -> EmptyState("No critical stock items")
                else -> LazyColumn(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        SuccessText(uiState.successMessage)
                        ErrorText(uiState.error)
                    }
                    items(uiState.items, key = { it.id }) { item ->
                        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(item.productName, style = MaterialTheme.typography.titleMedium)
                                Text("Stock: ${item.currentStock} / Critical: ${item.criticalLevel}")
                                Text("Suggested order: ${item.suggestedOrderQty}")
                                if (user.canCreatePurchaseRequest) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Button(
                                        onClick = { viewModel.createPurchaseRequest(user, item) },
                                        enabled = uiState.requestingProductId != item.productId,
                                    ) {
                                        if (uiState.requestingProductId == item.productId) {
                                            CircularProgressIndicator(
                                                modifier = Modifier.size(16.dp),
                                                strokeWidth = 2.dp,
                                            )
                                        } else {
                                            Text("Create Purchase Request")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
