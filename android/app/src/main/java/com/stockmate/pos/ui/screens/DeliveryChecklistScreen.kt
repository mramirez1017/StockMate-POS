package com.stockmate.pos.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.*
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.util.NumberInput
import com.stockmate.pos.viewmodel.DeliveryViewModel

@Composable
fun DeliveryChecklistScreen(
    user: User,
    poId: String,
    viewModel: DeliveryViewModel,
    onOpenChat: () -> Unit,
    onSubmitted: () -> Unit,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    var highlightId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(poId) {
        if (uiState.selectedPo?.id != poId) {
            viewModel.selectPurchaseOrder(user, poId)
        }
    }

    LaunchedEffect(uiState.successMessage) {
        if (uiState.successMessage != null) {
            onSubmitted()
        }
    }

    // Scroll to and highlight the line item matched by a barcode scan.
    LaunchedEffect(uiState.scrollToProductId) {
        val targetId = uiState.scrollToProductId ?: return@LaunchedEffect
        val position = uiState.receiveItems.indexOfFirst { it.productId == targetId }
        if (position >= 0) {
            highlightId = targetId
            // +1 accounts for the intro header item rendered before the list.
            listState.animateScrollToItem(position + 1)
        }
        viewModel.consumeScrollTarget()
    }

    val po = uiState.selectedPo

    StockMateScaffold(
        topBar = {
            StockMateTopBar(
                title = po?.poNumber ?: "Delivery Checklist",
                onBack = onBack,
                actions = {
                    if (po != null) {
                        IconButton(onClick = viewModel::toggleScanner) {
                            Icon(
                                Icons.Default.QrCodeScanner,
                                contentDescription = "Scan to find item",
                                tint = if (uiState.scannerVisible) StockMateColors.Brand600 else StockMateColors.Slate600,
                            )
                        }
                    }
                    IconButton(onClick = onOpenChat) {
                        Icon(
                            Icons.AutoMirrored.Filled.Chat,
                            contentDescription = "Delivery chat",
                            tint = StockMateColors.Brand600,
                        )
                    }
                },
            )
        },
        bottomBar = {
            if (po != null) {
                StockMateBottomBar {
                    StockMatePrimaryButton(
                        text = "Submit Delivery",
                        onClick = viewModel::submitDelivery,
                        enabled = !uiState.isSubmitting,
                        loading = uiState.isSubmitting,
                    )
                }
            }
        },
    ) { padding ->
        when {
            uiState.isLoading && po == null -> LoadingBox(Modifier.padding(padding))
            po == null -> ErrorText("Purchase order not found", Modifier.padding(padding).padding(16.dp))
            else -> LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 24.dp),
            ) {
                item {
                    SuccessText(uiState.successMessage)
                    ErrorText(uiState.error)
                    AnimatedVisibility(visible = uiState.scannerVisible) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(190.dp),
                            ) {
                                BarcodeScannerBox(
                                    onBarcodeDetected = { barcode -> viewModel.onBarcodeScanned(user, barcode) },
                                    modifier = Modifier.fillMaxSize(),
                                )
                            }
                            Text(
                                "Scan a product to jump to its line below.",
                                style = MaterialTheme.typography.labelMedium,
                                color = StockMateColors.Slate500,
                            )
                            Spacer(Modifier.height(4.dp))
                        }
                    }
                    uiState.scanNotice?.let { notice ->
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = StockMateColors.Brand50,
                            border = BorderStroke(1.dp, StockMateColors.Brand100),
                        ) {
                            Text(
                                notice,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                                color = StockMateColors.Brand700,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    Text(
                        "Check received and damaged quantities per line item.",
                        color = StockMateColors.Slate600,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                items(uiState.receiveItems, key = { it.productId }) { input ->
                    val poItem = po.items.find { it.productId == input.productId }
                    val highlighted = input.productId == highlightId
                    ElevatedCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .then(
                                if (highlighted) {
                                    Modifier.border(1.5.dp, StockMateColors.Brand500, RoundedCornerShape(12.dp))
                                } else {
                                    Modifier
                                }
                            ),
                        colors = CardDefaults.elevatedCardColors(
                            containerColor = if (highlighted) StockMateColors.Brand50 else StockMateColors.Panel,
                        ),
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                poItem?.productName ?: input.productId,
                                style = MaterialTheme.typography.titleMedium,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                "Expected: ${poItem?.expectedQty ?: 0}",
                                style = MaterialTheme.typography.bodySmall,
                                color = StockMateColors.Slate500,
                            )
                            OutlinedTextField(
                                value = input.receivedQty,
                                onValueChange = { v ->
                                    val sanitized = NumberInput.sanitizeIntegerInput(v)
                                    viewModel.updateReceiveItem(input.productId) { it.copy(receivedQty = sanitized) }
                                },
                                label = { Text("Received qty") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                            OutlinedTextField(
                                value = input.damagedQty,
                                onValueChange = { v ->
                                    val sanitized = NumberInput.sanitizeIntegerInput(v)
                                    viewModel.updateReceiveItem(input.productId) { it.copy(damagedQty = sanitized) }
                                },
                                label = { Text("Damaged qty") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                            OutlinedTextField(
                                value = input.remarks,
                                onValueChange = { v ->
                                    viewModel.updateReceiveItem(input.productId) { it.copy(remarks = v) }
                                },
                                label = { Text("Remarks") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                        }
                    }
                }
            }
        }
    }
}
