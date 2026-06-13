package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.BarcodeScannerBox
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.PosCheckoutSheet
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.formatCurrency
import com.stockmate.pos.viewmodel.PosViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosScreen(
    user: User,
    viewModel: PosViewModel,
    onNavigateToSearch: () -> Unit,
    onNavigateToPrinter: () -> Unit,
    onCheckoutSuccess: (com.stockmate.pos.data.models.Sale) -> Unit,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    var showCheckout by remember { mutableStateOf(false) }
    val totalDue = uiState.checkoutEstimate.total

    Scaffold(
        topBar = {
            StockMateTopBar(
                title = "POS",
                onBack = onBack,
                actions = {
                    IconButton(onClick = onNavigateToPrinter) {
                        Icon(Icons.Default.Print, contentDescription = "Printer")
                    }
                    IconButton(onClick = onNavigateToSearch) {
                        Icon(Icons.Default.Search, contentDescription = "Search")
                    }
                },
            )
        },
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Items: ${uiState.itemCount}")
                        Column(horizontalAlignment = Alignment.End) {
                            if (uiState.pwdOrSenior && uiState.cart.isNotEmpty()) {
                                Text(
                                    text = "Subtotal ${formatCurrency(uiState.subtotal)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                text = formatCurrency(if (uiState.cart.isEmpty()) uiState.subtotal else totalDue),
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = {
                            viewModel.openCheckout()
                            showCheckout = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = uiState.cart.isNotEmpty() && !uiState.isCheckingOut,
                    ) {
                        if (uiState.isCheckingOut) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        } else {
                            Text("Checkout")
                        }
                    }
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp),
            ) {
                BarcodeScannerBox(
                    onBarcodeDetected = { barcode ->
                        viewModel.setBarcodeInput(barcode)
                        viewModel.scanBarcode(user)
                    },
                    modifier = Modifier.fillMaxSize(),
                    enabled = !uiState.isCheckingOut,
                )
            }
            OutlinedTextField(
                value = uiState.barcodeInput,
                onValueChange = viewModel::setBarcodeInput,
                label = { Text("Barcode") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                trailingIcon = {
                    TextButton(onClick = { viewModel.scanBarcode(user) }) {
                        Text("Add")
                    }
                },
            )
            ErrorText(uiState.error)
            if (uiState.cart.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Cart is empty. Scan or search products.")
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(vertical = 8.dp),
                ) {
                    items(uiState.cart, key = { it.product.id }) { item ->
                        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.product.name, style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        formatCurrency(item.product.sellingPrice),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                }
                                IconButton(onClick = {
                                    viewModel.updateQuantity(item.product.id, item.quantity - 1)
                                }) {
                                    Icon(Icons.Default.Remove, contentDescription = "Decrease")
                                }
                                Text(item.quantity.toString())
                                IconButton(onClick = {
                                    viewModel.updateQuantity(item.product.id, item.quantity + 1)
                                }) {
                                    Icon(Icons.Default.Add, contentDescription = "Increase")
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCheckout) {
        PosCheckoutSheet(
            uiState = uiState,
            viewModel = viewModel,
            onDismiss = {
                if (!uiState.isCheckingOut) {
                    showCheckout = false
                    viewModel.dismissCheckout()
                }
            },
            onComplete = {
                viewModel.checkout(user) { sale ->
                    showCheckout = false
                    onCheckoutSuccess(sale)
                }
            },
        )
    }
}
