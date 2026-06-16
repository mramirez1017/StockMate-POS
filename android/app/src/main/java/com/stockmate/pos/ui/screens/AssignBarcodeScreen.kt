package com.stockmate.pos.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.BarcodeScannerBox
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.components.ProductAvatar
import com.stockmate.pos.ui.components.StockMateOutlinedFieldColors
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.StockPill
import com.stockmate.pos.ui.components.formatCurrency
import com.stockmate.pos.ui.theme.StockMateColors
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
                .imePadding()
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
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = StockMateColors.Slate400) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = StockMateOutlinedFieldColors(),
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
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { viewModel.selectProduct(product) },
                            shape = RoundedCornerShape(12.dp),
                            color = StockMateColors.Panel,
                            border = androidx.compose.foundation.BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),
                            shadowElevation = 1.dp,
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                ProductAvatar(product.name)
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        product.name,
                                        style = MaterialTheme.typography.bodyLarge,
                                        fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                                        color = StockMateColors.Slate900,
                                    )
                                    product.categoryName?.let {
                                        Text(it, style = MaterialTheme.typography.bodySmall, color = StockMateColors.Slate500)
                                    }
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        modifier = Modifier.padding(top = 4.dp),
                                    ) {
                                        Text(
                                            formatCurrency(product.sellingPrice),
                                            style = MaterialTheme.typography.labelMedium,
                                            color = StockMateColors.Slate600,
                                        )
                                        StockPill(product)
                                    }
                                }
                                Text(
                                    "Scan",
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                                    color = StockMateColors.Brand600,
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
                .imePadding()
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
                shape = RoundedCornerShape(12.dp),
                colors = StockMateOutlinedFieldColors(),
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
