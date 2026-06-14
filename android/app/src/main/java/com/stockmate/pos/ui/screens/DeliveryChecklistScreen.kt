package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
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
    onSubmitted: () -> Unit,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

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

    val po = uiState.selectedPo

    StockMateScaffold(
        topBar = {
            StockMateTopBar(
                title = po?.poNumber ?: "Delivery Checklist",
                onBack = onBack,
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
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 24.dp),
            ) {
                item {
                    SuccessText(uiState.successMessage)
                    ErrorText(uiState.error)
                    Text(
                        "Check received and damaged quantities per line item.",
                        color = StockMateColors.Slate600,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                items(uiState.receiveItems, key = { it.productId }) { input ->
                    val poItem = po.items.find { it.productId == input.productId }
                    ElevatedCard(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.elevatedCardColors(containerColor = StockMateColors.Panel),
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
