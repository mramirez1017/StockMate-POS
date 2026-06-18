package com.stockmate.pos.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
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
    val splitCoversTotal = PosCheckout.tenderCoversTotal(uiState.splitPaid, estimate.total)
    val splitExactIfNoCash = uiState.splitHasCash ||
        kotlin.math.round(uiState.splitPaid * 100) == kotlin.math.round(estimate.total * 100)
    val splitGcashOk = uiState.splits.none { it.method == "GCASH" && it.reference.trim().isEmpty() }
    val canComplete = if (uiState.splitMode) {
        splitCoversTotal && splitExactIfNoCash && splitGcashOk &&
            uiState.splits.any { (PosCheckout.parseMoney(it.amount) ?: 0.0) > 0 }
    } else {
        when (uiState.paymentMethod) {
            "CASH" -> tenderedSufficient
            "GCASH" -> uiState.gcashReference.trim().isNotEmpty()
            else -> true
        }
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

            if (uiState.allowManualDiscount) {
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("Manual discount (override)", style = MaterialTheme.typography.titleSmall)
                        OutlinedTextField(
                            value = uiState.manualDiscount,
                            onValueChange = viewModel::setManualDiscount,
                            label = { Text("Discount amount") },
                            placeholder = { Text("0.00") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !uiState.isCheckingOut,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        )
                        OutlinedTextField(
                            value = uiState.manualDiscountReason,
                            onValueChange = viewModel::setManualDiscountReason,
                            label = { Text("Reason (optional)") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            enabled = !uiState.isCheckingOut,
                        )
                        if (estimate.appliedManualDiscount > 0) {
                            Text(
                                "Applied: -${formatCurrency(estimate.appliedManualDiscount)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !uiState.isCheckingOut) { viewModel.toggleSplitMode() },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Switch(
                    checked = uiState.splitMode,
                    onCheckedChange = { viewModel.toggleSplitMode() },
                    enabled = !uiState.isCheckingOut,
                )
                Spacer(Modifier.width(8.dp))
                Column {
                    Text("Split payment", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Pay with more than one tender",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (uiState.splitMode) {
                SplitPaymentSection(uiState = uiState, viewModel = viewModel, totalDue = estimate.total)
            } else {
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
            }

            if (!uiState.splitMode && uiState.paymentMethod == "CASH") {
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

            if (!uiState.splitMode && uiState.paymentMethod == "GCASH") {
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
                    if (estimate.appliedManualDiscount > 0) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Manual discount", color = MaterialTheme.colorScheme.primary)
                            Text(
                                "-${formatCurrency(estimate.appliedManualDiscount)}",
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SplitPaymentSection(
    uiState: PosUiState,
    viewModel: PosViewModel,
    totalDue: Double,
) {
    Text("Split tenders", style = MaterialTheme.typography.titleSmall)
    uiState.splits.forEachIndexed { index, split ->
        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Tender ${index + 1}", style = MaterialTheme.typography.labelLarge)
                    if (uiState.splits.size > 1) {
                        IconButton(
                            onClick = { viewModel.removeSplit(index) },
                            enabled = !uiState.isCheckingOut,
                            modifier = Modifier.size(28.dp),
                        ) {
                            Icon(Icons.Default.Close, contentDescription = "Remove tender", modifier = Modifier.size(18.dp))
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PAYMENT_METHODS.forEach { method ->
                        FilterChip(
                            selected = split.method == method,
                            onClick = { viewModel.updateSplit(index, method = method) },
                            label = { Text(method) },
                            enabled = !uiState.isCheckingOut,
                        )
                    }
                }
                OutlinedTextField(
                    value = split.amount,
                    onValueChange = { viewModel.updateSplit(index, amount = it) },
                    label = { Text("Amount") },
                    placeholder = { Text("0.00") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = !uiState.isCheckingOut,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                if (split.method == "GCASH") {
                    OutlinedTextField(
                        value = split.reference,
                        onValueChange = { viewModel.updateSplit(index, reference = it) },
                        label = { Text("GCash reference *") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        enabled = !uiState.isCheckingOut,
                    )
                }
            }
        }
    }

    TextButton(
        onClick = { viewModel.addSplit() },
        enabled = !uiState.isCheckingOut,
    ) {
        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(4.dp))
        Text("Add tender")
    }

    val remaining = PosCheckout.roundMoney(totalDue - uiState.splitPaid)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Paid")
                Text(formatCurrency(uiState.splitPaid), fontWeight = FontWeight.SemiBold)
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(if (remaining > 0) "Remaining" else "Change")
                Text(
                    formatCurrency(kotlin.math.abs(remaining)),
                    fontWeight = FontWeight.SemiBold,
                    color = if (remaining > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}
