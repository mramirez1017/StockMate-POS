package com.stockmate.pos.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.BarcodeScannerBox
import com.stockmate.pos.ui.components.EmptyState
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.components.ProductAvatar
import com.stockmate.pos.ui.components.StockPill
import com.stockmate.pos.ui.components.StockMateOutlinedFieldColors
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.formatCurrency
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.viewmodel.ProductSearchViewModel

@Composable
fun ProductSearchScreen(
    user: User,
    viewModel: ProductSearchViewModel,
    onProductSelected: (Product) -> Unit,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    var scannerVisible by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.query) {
        viewModel.search(user)
    }

    StockMateScaffold(
        topBar = { StockMateTopBar(title = "Product Search", onBack = onBack) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = uiState.query,
                onValueChange = viewModel::setQuery,
                placeholder = { Text("Search by name, SKU, or barcode") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = StockMateColors.Slate400) },
                trailingIcon = {
                    if (uiState.query.isNotEmpty()) {
                        IconButton(onClick = { viewModel.setQuery("") }) {
                            Icon(Icons.Default.Close, contentDescription = "Clear", tint = StockMateColors.Slate500)
                        }
                    } else {
                        IconButton(onClick = { scannerVisible = !scannerVisible }) {
                            Icon(
                                Icons.Default.QrCodeScanner,
                                contentDescription = "Scan barcode",
                                tint = if (scannerVisible) StockMateColors.Brand600 else StockMateColors.Slate500,
                            )
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = StockMateOutlinedFieldColors(),
            )

            AnimatedVisibility(visible = scannerVisible) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(190.dp),
                ) {
                    BarcodeScannerBox(
                        onBarcodeDetected = { barcode ->
                            viewModel.setQuery(barcode)
                            scannerVisible = false
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }

            ErrorText(uiState.error)

            when {
                uiState.isLoading -> LoadingBox(Modifier.weight(1f))
                uiState.products.isEmpty() -> EmptyState("No products found", Modifier.weight(1f))
                else -> LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.products, key = { it.id }) { product ->
                        ProductResultCard(product = product, onClick = { onProductSelected(product) })
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductResultCard(product: Product, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = StockMateColors.Panel,
        border = BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),
        shadowElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ProductAvatar(product.name)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    product.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = StockMateColors.Slate900,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    product.sku?.let {
                        Text("SKU $it", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate500)
                    }
                    StockPill(product)
                }
                if (product.isPacked) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        product.packNote(product.currentStock),
                        style = MaterialTheme.typography.labelSmall,
                        color = StockMateColors.Slate400,
                    )
                }
            }
            Text(
                formatCurrency(product.sellingPrice),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = StockMateColors.Slate900,
            )
        }
    }
}
