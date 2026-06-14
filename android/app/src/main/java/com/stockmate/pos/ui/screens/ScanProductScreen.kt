package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
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
import com.stockmate.pos.viewmodel.ScanProductViewModel

@Composable
fun ScanProductScreen(
    user: User,
    viewModel: ScanProductViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    StockMateScaffold(
        topBar = { StockMateTopBar(title = "Scan Product", onBack = onBack) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
            ) {
                BarcodeScannerBox(
                    onBarcodeDetected = { barcode ->
                        viewModel.setBarcodeInput(barcode)
                        viewModel.lookup(user)
                    },
                    modifier = Modifier.fillMaxSize(),
                    enabled = !uiState.isLoading,
                )
            }
            OutlinedTextField(
                value = uiState.barcodeInput,
                onValueChange = viewModel::setBarcodeInput,
                label = { Text("Barcode") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                trailingIcon = {
                    TextButton(onClick = { viewModel.lookup(user) }) {
                        Text("Lookup")
                    }
                },
            )
            Text(
                text = "Stock shown is for your assigned branch only.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            ErrorText(uiState.error)
            if (uiState.isLoading) {
                LoadingBox(Modifier.weight(1f))
            } else {
                uiState.product?.let { product ->
                    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(product.name, style = MaterialTheme.typography.headlineMedium)
                            product.categoryName?.let {
                                Text("Category: $it", style = MaterialTheme.typography.bodyMedium)
                            }
                            Text(
                                "Price: ${formatCurrency(product.sellingPrice)}",
                                style = MaterialTheme.typography.titleLarge,
                            )
                            Text(
                                "Branch stock: ${product.currentStock} ${product.unit}",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            if (product.isCritical) {
                                AssistChip(
                                    onClick = {},
                                    label = { Text("Critical Stock") },
                                    colors = AssistChipDefaults.assistChipColors(
                                        containerColor = MaterialTheme.colorScheme.errorContainer,
                                    ),
                                )
                            }
                        }
                    }
                } ?: Box(
                    modifier = Modifier.weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "Scan or enter a barcode to view product details",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
