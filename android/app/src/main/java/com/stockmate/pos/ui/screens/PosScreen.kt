package com.stockmate.pos.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCartCheckout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.BarcodeScannerBox
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.PosCheckoutSheet
import com.stockmate.pos.ui.components.ProductAvatar
import com.stockmate.pos.ui.components.StockPill
import com.stockmate.pos.ui.components.StockMateBottomBar
import com.stockmate.pos.ui.components.StockMateOutlinedFieldColors
import com.stockmate.pos.ui.components.StockMatePrimaryButton
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.formatCurrency
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.util.NumberInput
import com.stockmate.pos.viewmodel.PosUiState
import com.stockmate.pos.viewmodel.PosViewModel
import kotlinx.coroutines.delay

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

    // Auto-dismiss the "added to cart" confirmation.
    LaunchedEffect(uiState.addedNotice) {
        if (uiState.addedNotice != null) {
            delay(1600)
            viewModel.dismissAddedNotice()
        }
    }

    StockMateScaffold(
        topBar = {
            StockMateTopBar(
                title = "POS",
                onBack = onBack,
                actions = {
                    IconButton(onClick = onNavigateToPrinter) {
                        Icon(Icons.Default.Print, contentDescription = "Printer", tint = StockMateColors.Slate600)
                    }
                },
            )
        },
        bottomBar = {
            StockMateBottomBar {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            "Items in cart",
                            style = MaterialTheme.typography.labelSmall,
                            color = StockMateColors.Slate500,
                        )
                        Text(
                            "${uiState.itemCount}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = StockMateColors.Slate900,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        if (uiState.pwdOrSenior && uiState.cart.isNotEmpty()) {
                            Text(
                                text = "Subtotal ${formatCurrency(uiState.subtotal)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = StockMateColors.Slate500,
                            )
                        }
                        Text(
                            text = "Total due",
                            style = MaterialTheme.typography.labelSmall,
                            color = StockMateColors.Slate500,
                        )
                        Text(
                            text = formatCurrency(if (uiState.cart.isEmpty()) 0.0 else totalDue),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = StockMateColors.Brand700,
                        )
                    }
                }
                StockMatePrimaryButton(
                    text = if (uiState.cart.isEmpty()) "Add items to checkout" else "Checkout · ${formatCurrency(totalDue)}",
                    onClick = {
                        viewModel.openCheckout()
                        showCheckout = true
                    },
                    enabled = uiState.cart.isNotEmpty() && !uiState.isCheckingOut,
                    loading = uiState.isCheckingOut,
                )
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            // ── Search-first input with scan toggle ──────────────────────
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { viewModel.setSearchQuery(user, it) },
                placeholder = { Text("Search product by name, SKU, or barcode") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = StockMateColors.Slate400) },
                trailingIcon = {
                    if (uiState.searchQuery.isNotEmpty()) {
                        IconButton(onClick = { viewModel.clearSearch() }) {
                            Icon(Icons.Default.Close, contentDescription = "Clear", tint = StockMateColors.Slate500)
                        }
                    } else {
                        IconButton(onClick = { viewModel.toggleScanner() }) {
                            Icon(
                                Icons.Default.QrCodeScanner,
                                contentDescription = "Scan barcode",
                                tint = if (uiState.scannerVisible) StockMateColors.Brand600 else StockMateColors.Slate500,
                            )
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = StockMateOutlinedFieldColors(),
            )

            // ── Collapsible scanner card ─────────────────────────────────
            AnimatedVisibility(visible = uiState.scannerVisible) {
                ScannerCard(
                    uiState = uiState,
                    onBarcodeChange = viewModel::setBarcodeInput,
                    onDetected = { barcode ->
                        viewModel.setBarcodeInput(barcode)
                        viewModel.scanBarcode(user)
                    },
                    onAdd = { viewModel.scanBarcode(user) },
                    onClose = { viewModel.toggleScanner() },
                )
            }

            // ── "Added to cart" confirmation ─────────────────────────────
            AnimatedVisibility(visible = uiState.addedNotice != null) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    color = StockMateColors.Brand50,
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, StockMateColors.Brand200),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, tint = StockMateColors.Brand600, modifier = Modifier.size(16.dp))
                        Text(
                            uiState.addedNotice ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            color = StockMateColors.Brand700,
                        )
                    }
                }
            }

            ErrorText(uiState.error)

            // ── Body: search results OR cart ─────────────────────────────
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when {
                    uiState.searchQuery.isNotBlank() -> SearchResults(
                        uiState = uiState,
                        onAdd = { viewModel.addFromSearch(it) },
                    )
                    uiState.cart.isEmpty() -> EmptyCart()
                    else -> CartList(uiState = uiState, viewModel = viewModel)
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

@Composable
private fun ScannerCard(
    uiState: PosUiState,
    onBarcodeChange: (String) -> Unit,
    onDetected: (String) -> Unit,
    onAdd: () -> Unit,
    onClose: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp),
        shape = RoundedCornerShape(16.dp),
        color = StockMateColors.Panel,
        border = BorderStroke(1.dp, StockMateColors.Border),
        shadowElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = StockMateColors.Brand600, modifier = Modifier.size(18.dp))
                    Text("Scan barcode", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = StockMateColors.Slate900)
                }
                IconButton(onClick = onClose, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Default.Close, contentDescription = "Hide scanner", tint = StockMateColors.Slate500, modifier = Modifier.size(18.dp))
                }
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
            ) {
                BarcodeScannerBox(
                    onBarcodeDetected = onDetected,
                    modifier = Modifier.fillMaxSize(),
                    enabled = !uiState.isCheckingOut,
                )
            }
            OutlinedTextField(
                value = uiState.barcodeInput,
                onValueChange = onBarcodeChange,
                label = { Text("Enter barcode manually") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = StockMateOutlinedFieldColors(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                trailingIcon = {
                    TextButton(onClick = onAdd, enabled = uiState.barcodeInput.isNotBlank()) {
                        Text("Add", color = StockMateColors.Brand600, fontWeight = FontWeight.SemiBold)
                    }
                },
            )
        }
    }
}

@Composable
private fun SearchResults(
    uiState: PosUiState,
    onAdd: (Product) -> Unit,
) {
    when {
        uiState.isSearching && uiState.searchResults.isEmpty() -> Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = StockMateColors.Brand600)
        }
        uiState.searchResults.isEmpty() -> Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "No products match \"${uiState.searchQuery}\"",
                color = StockMateColors.Slate500,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(24.dp),
            )
        }
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 8.dp),
        ) {
            items(uiState.searchResults, key = { it.id }) { product ->
                SearchResultRow(product = product, onAdd = { onAdd(product) })
            }
        }
    }
}

@Composable
private fun SearchResultRow(product: Product, onAdd: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onAdd),
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
                    product.categoryName?.let {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate500)
                    }
                    StockPill(product)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    formatCurrency(product.sellingPrice),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = StockMateColors.Slate900,
                )
                Spacer(Modifier.height(4.dp))
                Surface(
                    shape = CircleShape,
                    color = StockMateColors.Brand600,
                    modifier = Modifier.size(32.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Add, contentDescription = "Add to cart", tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyCart() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Surface(shape = CircleShape, color = StockMateColors.Brand50, modifier = Modifier.size(72.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Default.ShoppingCartCheckout, contentDescription = null, tint = StockMateColors.Brand600, modifier = Modifier.size(34.dp))
            }
        }
        Spacer(Modifier.height(16.dp))
        Text("Your cart is empty", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = StockMateColors.Slate800)
        Spacer(Modifier.height(4.dp))
        Text(
            "Search for a product above or tap the scan icon to add items.",
            style = MaterialTheme.typography.bodySmall,
            color = StockMateColors.Slate500,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 32.dp),
        )
    }
}

@Composable
private fun CartList(uiState: PosUiState, viewModel: PosViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Default.Inventory2, contentDescription = null, tint = StockMateColors.Slate500, modifier = Modifier.size(16.dp))
                Text("Cart (${uiState.cart.size})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = StockMateColors.Slate900)
            }
            TextButton(onClick = { viewModel.clearCart() }) {
                Text("Clear all", color = StockMateColors.Red600, style = MaterialTheme.typography.labelMedium)
            }
        }
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 4.dp),
        ) {
            items(uiState.cart, key = { it.product.id }) { item ->
                CartItemCard(
                    name = item.product.name,
                    unitPrice = item.product.sellingPrice,
                    lineTotal = item.lineTotal,
                    quantity = item.quantity,
                    enabled = !uiState.isCheckingOut,
                    onDecrease = { viewModel.updateQuantity(item.product.id, item.quantity - 1) },
                    onIncrease = { viewModel.updateQuantity(item.product.id, item.quantity + 1) },
                    onQuantityChange = { viewModel.updateQuantity(item.product.id, it) },
                    onRemove = { viewModel.removeItem(item.product.id) },
                )
            }
        }
    }
}

@Composable
private fun CartItemCard(
    name: String,
    unitPrice: Double,
    lineTotal: Double,
    quantity: Int,
    enabled: Boolean,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    onQuantityChange: (Int) -> Unit,
    onRemove: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = StockMateColors.Panel,
        border = BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),
        shadowElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                    Text(
                        name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = StockMateColors.Slate900,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        "${formatCurrency(unitPrice)} each",
                        style = MaterialTheme.typography.bodySmall,
                        color = StockMateColors.Slate500,
                    )
                }
                Text(
                    formatCurrency(lineTotal),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = StockMateColors.Brand700,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StepperButton(icon = Icons.Default.Remove, enabled = enabled, onClick = onDecrease)
                    QuantityEditor(quantity = quantity, enabled = enabled, onQuantityChange = onQuantityChange)
                    StepperButton(icon = Icons.Default.Add, enabled = enabled, onClick = onIncrease)
                }
                IconButton(onClick = onRemove, enabled = enabled) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = "Remove", tint = StockMateColors.Red600)
                }
            }
        }
    }
}

@Composable
private fun StepperButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        color = StockMateColors.Slate100,
        modifier = Modifier.size(36.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = StockMateColors.Slate700, modifier = Modifier.size(18.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuantityEditor(
    quantity: Int,
    enabled: Boolean,
    onQuantityChange: (Int) -> Unit,
) {
    var text by remember(quantity) { mutableStateOf(quantity.toString()) }
    OutlinedTextField(
        value = text,
        onValueChange = { raw ->
            val sanitized = NumberInput.sanitizeIntegerInput(raw)
            text = sanitized
            if (sanitized.isNotEmpty()) {
                onQuantityChange(NumberInput.parseInteger(sanitized))
            }
        },
        modifier = Modifier.width(68.dp),
        enabled = enabled,
        singleLine = true,
        textStyle = MaterialTheme.typography.titleMedium.copy(textAlign = TextAlign.Center, fontSize = 16.sp),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = StockMateColors.Brand600,
            focusedLabelColor = StockMateColors.Brand600,
        ),
    )
}
