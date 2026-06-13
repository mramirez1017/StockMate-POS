package com.stockmate.pos.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.EmptyState
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.formatCurrency
import com.stockmate.pos.viewmodel.ProductSearchViewModel

@Composable
fun ProductSearchScreen(
    user: User,
    viewModel: ProductSearchViewModel,
    onProductSelected: (Product) -> Unit,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.query) {
        viewModel.search(user)
    }

    Scaffold(
        topBar = { StockMateTopBar(title = "Product Search", onBack = onBack) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
        ) {
            OutlinedTextField(
                value = uiState.query,
                onValueChange = viewModel::setQuery,
                label = { Text("Search by name, SKU, or barcode") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            ErrorText(uiState.error)
            when {
                uiState.isLoading -> LoadingBox(Modifier.weight(1f))
                uiState.products.isEmpty() -> EmptyState("No products found", Modifier.weight(1f))
                else -> LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.products, key = { it.id }) { product ->
                        ElevatedCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onProductSelected(product) },
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(product.name, style = MaterialTheme.typography.titleMedium)
                                    product.sku?.let {
                                        Text("SKU: $it", style = MaterialTheme.typography.bodySmall)
                                    }
                                    Text(
                                        "Stock: ${product.currentStock}",
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                Text(
                                    formatCurrency(product.sellingPrice),
                                    style = MaterialTheme.typography.titleMedium,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
