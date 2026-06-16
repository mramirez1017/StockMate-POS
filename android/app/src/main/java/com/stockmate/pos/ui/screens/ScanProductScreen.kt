package com.stockmate.pos.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.BarcodeScannerBox
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.components.ProductAvatar
import com.stockmate.pos.ui.components.StockPill
import com.stockmate.pos.ui.components.StockMateOutlinedFieldColors
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.formatCurrency
import com.stockmate.pos.ui.theme.StockMateColors
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
                .imePadding()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
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
                label = { Text("Enter barcode manually") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = StockMateOutlinedFieldColors(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                trailingIcon = {
                    TextButton(onClick = { viewModel.lookup(user) }, enabled = uiState.barcodeInput.isNotBlank()) {
                        Text("Lookup", color = StockMateColors.Brand600, fontWeight = FontWeight.SemiBold)
                    }
                },
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Default.Info, contentDescription = null, tint = StockMateColors.Slate400, modifier = Modifier.size(14.dp))
                Text(
                    text = "Stock shown is for your assigned branch only.",
                    style = MaterialTheme.typography.labelSmall,
                    color = StockMateColors.Slate500,
                )
            }
            ErrorText(uiState.error)

            if (uiState.isLoading) {
                LoadingBox(Modifier.weight(1f))
            } else {
                uiState.product?.let { product ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        color = StockMateColors.Panel,
                        border = BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),
                        shadowElevation = 1.dp,
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                ProductAvatar(product.name)
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        product.name,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = StockMateColors.Slate900,
                                    )
                                    product.categoryName?.let {
                                        Text(it, style = MaterialTheme.typography.bodySmall, color = StockMateColors.Slate500)
                                    }
                                }
                                StockPill(product)
                            }
                            HorizontalDivider(color = StockMateColors.Border.copy(alpha = 0.7f))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column {
                                    Text("Price", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate500)
                                    Text(
                                        formatCurrency(product.sellingPrice),
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = StockMateColors.Slate900,
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("Branch stock", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate500)
                                    Text(
                                        "${product.currentStock} ${product.unit}",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = if (product.isCritical) StockMateColors.Red600 else StockMateColors.Slate900,
                                    )
                                }
                            }
                            if (product.isCritical) {
                                Surface(shape = RoundedCornerShape(8.dp), color = StockMateColors.Rose100) {
                                    Text(
                                        "Critical stock — reorder soon",
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = StockMateColors.Red600,
                                    )
                                }
                            }
                        }
                    }
                } ?: Column(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Surface(shape = RoundedCornerShape(20.dp), color = StockMateColors.Brand50, modifier = Modifier.size(64.dp)) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = StockMateColors.Brand600, modifier = Modifier.size(30.dp))
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Scan or enter a barcode to view product details",
                        style = MaterialTheme.typography.bodyMedium,
                        color = StockMateColors.Slate500,
                    )
                }
            }
        }
    }
}
