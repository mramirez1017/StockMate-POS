package com.stockmate.pos.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.stockmate.pos.util.PosCheckout
import com.stockmate.pos.viewmodel.PosUiState
import com.stockmate.pos.viewmodel.PosViewModel

private val PAYMENT_METHODS = listOf("CASH", "CARD", "GCASH")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosCheckoutSheet(
    uiState: PosUiState,
    viewModel: PosViewModel,
    onDismiss: () -> Unit,
    onComplete: () -> Unit,
) {
    var showKeypad by remember { mutableStateOf(false) }
    val estimate = uiState.checkoutEstimate
    val tendered = PosCheckout.parseMoney(uiState.amountTendered)
    val tenderedSufficient =
        tendered != null && PosCheckout.tenderCoversTotal(tendered, estimate.total)
    val changeDue = if (uiState.paymentMethod == "CASH" && tenderedSufficient) {
        PosCheckout.roundMoney(tendered!! - estimate.total)
    } else {
        null
    }
    val canComplete = when (uiState.paymentMethod) {
        "CASH" -> tenderedSufficient
        "GCASH" -> uiState.gcashReference.trim().isNotEmpty()
        else -> true
    }

    ModalBottomSheet(
        onDismissRequest = { if (!uiState.isCheckingOut) onDismiss() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 32.dp)
                .windowInsetsPadding(WindowInsets.navigationBars),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Complete transaction", style = MaterialTheme.typography.titleLarge)

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !uiState.isCheckingOut) {
                        viewModel.setPwdOrSenior(!uiState.pwdOrSenior)
                    },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = uiState.pwdOrSenior,
                    onCheckedChange = viewModel::setPwdOrSenior,
                    enabled = !uiState.isCheckingOut,
                )
                Column {
                    Text("PWD or Senior Citizen discount", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "20% off after promos (if applicable)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Text("Payment method", style = MaterialTheme.typography.titleSmall)
            PAYMENT_METHODS.forEach { method ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = !uiState.isCheckingOut) {
                            viewModel.setPaymentMethod(method)
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = uiState.paymentMethod == method,
                        onClick = { viewModel.setPaymentMethod(method) },
                        enabled = !uiState.isCheckingOut,
                    )
                    Text(method)
                }
            }

            if (uiState.paymentMethod == "CASH") {
                LaunchedEffect(uiState.paymentMethod) {
                    if (uiState.amountTendered.isBlank()) showKeypad = true
                }
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Amount tendered", style = MaterialTheme.typography.titleSmall)
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = uiState.amountTendered.ifBlank { "" },
                            onValueChange = {},
                            readOnly = true,
                            placeholder = { Text("Tap to enter amount") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showKeypad = true },
                            enabled = !uiState.isCheckingOut,
                            trailingIcon = {
                                Icon(Icons.Default.KeyboardArrowDown, contentDescription = null)
                            },
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Change")
                            Text(
                                text = when {
                                    tendered == null -> "—"
                                    !tenderedSufficient -> "Insufficient"
                                    else -> formatCurrency(changeDue ?: 0.0)
                                },
                                color = if (tenderedSufficient) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.error
                                },
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
                    }
                }
            }

            if (uiState.paymentMethod == "GCASH") {
                OutlinedTextField(
                    value = uiState.gcashReference,
                    onValueChange = viewModel::setGcashReference,
                    label = { Text("GCash reference number *") },
                    placeholder = { Text("Transaction reference") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = !uiState.isCheckingOut,
                )
            }

            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Subtotal")
                        Text(formatCurrency(uiState.subtotal))
                    }
                    if (estimate.pwdSeniorDiscountAmount > 0) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("PWD / Senior (20%)", color = MaterialTheme.colorScheme.primary)
                            Text(
                                "-${formatCurrency(estimate.pwdSeniorDiscountAmount)}",
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                    HorizontalDivider()
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Total due", style = MaterialTheme.typography.titleMedium)
                        Text(
                            formatCurrency(estimate.total),
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                    Text(
                        "Promo discounts are applied when the transaction completes.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            ErrorText(uiState.error)

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StockMateSecondaryButton(
                    text = "Cancel",
                    onClick = onDismiss,
                    enabled = !uiState.isCheckingOut,
                )
                StockMatePrimaryButton(
                    text = "Complete sale",
                    onClick = onComplete,
                    enabled = !uiState.isCheckingOut && canComplete,
                    loading = uiState.isCheckingOut,
                )
            }
        }
    }

    if (showKeypad) {
        MoneyKeypadSheet(
            title = "Amount tendered",
            amount = uiState.amountTendered,
            totalDue = estimate.total,
            onAmountChange = viewModel::setAmountTendered,
            onDismiss = { showKeypad = false },
            onConfirm = { showKeypad = false },
        )
    }
}
