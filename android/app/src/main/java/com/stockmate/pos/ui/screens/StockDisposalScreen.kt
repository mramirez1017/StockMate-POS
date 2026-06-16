package com.stockmate.pos.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.DisposalReason
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.BarcodeScannerBox
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.ProductAvatar
import com.stockmate.pos.ui.components.StockPill
import com.stockmate.pos.ui.components.StockMateBottomBar
import com.stockmate.pos.ui.components.StockMateOutlinedFieldColors
import com.stockmate.pos.ui.components.StockMatePrimaryButton
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.SuccessText
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.viewmodel.DisposalViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockDisposalScreen(
    user: User,
    viewModel: DisposalViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    var reasonExpanded by remember { mutableStateOf(false) }
    var scannerVisible by remember { mutableStateOf(false) }

    StockMateScaffold(
        topBar = { StockMateTopBar(title = "Stock Disposal", onBack = onBack) },
        bottomBar = {
            StockMateBottomBar {
                StockMatePrimaryButton(
                    text = "Submit Disposal",
                    onClick = { viewModel.submit(user) },
                    enabled = !uiState.isSubmitting && uiState.selectedProduct != null,
                    loading = uiState.isSubmitting,
                )
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SuccessText(uiState.successMessage)
            ErrorText(uiState.error)

            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = viewModel::setSearchQuery,
                label = { Text("Search product to dispose") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = StockMateColors.Slate400) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = StockMateOutlinedFieldColors(),
                trailingIcon = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { scannerVisible = !scannerVisible }) {
                            Icon(
                                Icons.Default.QrCodeScanner,
                                contentDescription = "Scan barcode",
                                tint = if (scannerVisible) StockMateColors.Brand600 else StockMateColors.Slate500,
                            )
                        }
                        TextButton(onClick = { viewModel.search(user) }) {
                            Text("Search", color = StockMateColors.Brand600, fontWeight = FontWeight.SemiBold)
                        }
                    }
                },
            )

            AnimatedVisibility(visible = scannerVisible) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(190.dp),
                ) {
                    BarcodeScannerBox(
                        onBarcodeDetected = { barcode ->
                            viewModel.setSearchQuery(barcode)
                            viewModel.search(user)
                            scannerVisible = false
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }

            if (uiState.searchResults.isNotEmpty()) {
                LazyColumn(
                    modifier = Modifier.heightIn(max = 240.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.searchResults, key = { it.id }) { product ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { viewModel.selectProduct(product) },
                            shape = RoundedCornerShape(12.dp),
                            color = StockMateColors.Panel,
                            border = BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                ProductAvatar(product.name, size = 38.dp)
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        product.name,
                                        style = MaterialTheme.typography.bodyLarge,
                                        fontWeight = FontWeight.SemiBold,
                                        color = StockMateColors.Slate900,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    product.categoryName?.let {
                                        Text(it, style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate500)
                                    }
                                }
                                StockPill(product)
                            }
                        }
                    }
                }
            }

            uiState.selectedProduct?.let { product ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = StockMateColors.Brand50,
                    border = BorderStroke(1.dp, StockMateColors.Brand200),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StockMateColors.Brand600, modifier = Modifier.size(22.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Selected product", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Brand700)
                            Text(
                                product.name,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.SemiBold,
                                color = StockMateColors.Slate900,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        StockPill(product)
                    }
                }
            }

            OutlinedTextField(
                value = uiState.quantity,
                onValueChange = viewModel::setQuantity,
                label = { Text("Quantity to dispose") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = StockMateOutlinedFieldColors(),
            )

            ExposedDropdownMenuBox(
                expanded = reasonExpanded,
                onExpandedChange = { reasonExpanded = it },
            ) {
                OutlinedTextField(
                    value = uiState.reason.label,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Reason") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    shape = RoundedCornerShape(12.dp),
                    colors = StockMateOutlinedFieldColors(),
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = reasonExpanded) },
                )
                ExposedDropdownMenu(
                    expanded = reasonExpanded,
                    onDismissRequest = { reasonExpanded = false },
                ) {
                    DisposalReason.entries.forEach { reason ->
                        DropdownMenuItem(
                            text = { Text(reason.label) },
                            onClick = {
                                viewModel.setReason(reason)
                                reasonExpanded = false
                            },
                        )
                    }
                }
            }

            OutlinedTextField(
                value = uiState.remarks,
                onValueChange = viewModel::setRemarks,
                label = { Text("Remarks (optional)") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = StockMateOutlinedFieldColors(),
                minLines = 2,
            )
        }
    }
}
