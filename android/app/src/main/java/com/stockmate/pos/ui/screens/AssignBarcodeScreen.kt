package com.stockmate.pos.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.BarcodeScannerBox
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.formatCurrency
import com.stockmate.pos.viewmodel.AssignBarcodeViewModel

@Composable
fun AssignBarcodeScreen(
    user: User,
    viewModel: AssignBarcodeViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(user.id, uiState.searchQuery) {
        viewModel.loadMissingBarcodeProducts(user)
    }

    if (uiState.selectedProduct != null) {
        AssignBarcodeScanPanel(
            user = user,
            viewModel = viewModel,
            onBack = { viewModel.clearSelection() },
        )
        return
    }

    StockMateScaffold(
        topBar = { StockMateTopBar(title = "Assign Barcode", onBack = onBack) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Products without a barcode at your branch. Select one, then scan the physical label.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = viewModel::setSearchQuery,
                label = { Text("Search product") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            ErrorText(uiState.error)
            uiState.successMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
            }
            if (uiState.isLoading) {
                LoadingBox(Modifier.weight(1f))
            } else if (uiState.products.isEmpty()) {
                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    Text(
                        "No products waiting for a barcode.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.products, key = { it.id }) { product ->
                        ElevatedCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { viewModel.selectProduct(product) },
                        ) {
                            Column(Modifier.padding(16.dp)) {
                                Text(product.name, style = MaterialTheme.typography.titleMedium)
                                product.categoryName?.let {
                                    Text(it, style = MaterialTheme.typography.bodySmall)
                                }
                                Text(
                                    "${formatCurrency(product.sellingPrice)} · Stock: ${product.currentStock} ${product.unit}",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Text(
                                    "Tap to scan barcode",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AssignBarcodeScanPanel(
    user: User,
    viewModel: AssignBarcodeViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val product = uiState.selectedProduct ?: return

    StockMateScaffold(
        topBar = { StockMateTopBar(title = "Scan Barcode", onBack = onBack) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(product.name, style = MaterialTheme.typography.titleLarge)
                    product.categoryName?.let {
                        Text("Category: $it", style = MaterialTheme.typography.bodyMedium)
                    }
                    Text(
                        "Price: ${formatCurrency(product.sellingPrice)}",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        "Branch stock: ${product.currentStock} ${product.unit}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            Text(
                "Only the barcode will be saved. Other product details cannot be changed here.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
            ) {
                BarcodeScannerBox(
                    onBarcodeDetected = viewModel::onBarcodeScanned,
                    modifier = Modifier.fillMaxSize(),
                    enabled = !uiState.isSaving,
                )
            }

            OutlinedTextField(
                value = uiState.scannedBarcode,
                onValueChange = viewModel::setScannedBarcode,
                label = { Text("Scanned barcode") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                readOnly = false,
            )

            ErrorText(uiState.error)
            uiState.successMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.primary)
            }

            Button(
                onClick = { viewModel.saveBarcode(user) {} },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isSaving && uiState.scannedBarcode.isNotBlank(),
            ) {
                if (uiState.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Save barcode")
                }
            }
        }
    }
}
