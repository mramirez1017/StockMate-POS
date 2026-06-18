package com.stockmate.pos.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.Sale
import com.stockmate.pos.data.models.SaleStatus
import com.stockmate.pos.ui.components.EmptyState
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.components.StockMateBottomBar
import com.stockmate.pos.ui.components.StockMatePrimaryButton
import com.stockmate.pos.ui.components.StockMateSecondaryButton
import com.stockmate.pos.ui.components.StockMateScaffold
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.StockMateOutlinedFieldColors
import com.stockmate.pos.ui.components.formatCurrency
import com.stockmate.pos.ui.theme.StockMateColors
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ReceiptScreen(
    sale: Sale?,
    currency: String,
    onPrint: () -> Unit,
    onNewSale: () -> Unit,
    onViewHistory: (String) -> Unit,
    onLoadHistory: () -> Unit,
    recentSales: List<Sale>,
    isLoading: Boolean,
    onBack: () -> Unit,
    canReturn: Boolean = false,
    returnSubmitting: Boolean = false,
    returnNotice: String? = null,
    returnError: String? = null,
    onReturn: (List<Triple<String, Int, Boolean>>, String?, String?) -> Unit = { _, _, _ -> },
    onConsumeReturnMessages: () -> Unit = {},
) {
    LaunchedEffect(Unit) {
        if (sale == null) onLoadHistory()
    }

    var showReturn by remember { mutableStateOf(false) }
    val returnable = sale != null &&
        canReturn &&
        (sale.status == SaleStatus.COMPLETED || sale.status == SaleStatus.PARTIALLY_REFUNDED)

    LaunchedEffect(returnNotice) {
        if (returnNotice != null) {
            showReturn = false
            kotlinx.coroutines.delay(2500)
            onConsumeReturnMessages()
        }
    }

    StockMateScaffold(
        topBar = {
            StockMateTopBar(
                title = if (sale != null) "Receipt" else "Receipts",
                onBack = onBack,
                actions = {
                    if (sale != null) {
                        IconButton(onClick = onPrint) {
                            Icon(Icons.Default.Print, contentDescription = "Print")
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (sale != null) {
                StockMateBottomBar {
                    if (returnable) {
                        StockMateSecondaryButton(text = "Return", onClick = { showReturn = true })
                    } else {
                        StockMateSecondaryButton(text = "Print", onClick = onPrint)
                    }
                    StockMatePrimaryButton(text = "New Sale", onClick = onNewSale)
                }
            }
        },
    ) { padding ->
        when {
            isLoading -> LoadingBox(Modifier.padding(padding))
            sale != null -> ReceiptContent(sale, currency, Modifier.padding(padding))
            recentSales.isEmpty() -> EmptyState("No receipts yet", Modifier.padding(padding))
            else -> LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    Text("Recent Sales", style = MaterialTheme.typography.titleMedium)
                }
                items(recentSales, key = { it.id }) { s ->
                    ElevatedCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onViewHistory(s.id) },
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column {
                                Text(formatDate(s.createdAt))
                                Text(s.cashierName, style = MaterialTheme.typography.bodySmall)
                            }
                            Text(
                                formatCurrency(s.total, currency),
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
                    }
                }
            }
        }
    }

    if (showReturn && sale != null) {
        ReturnDialog(
            sale = sale,
            currency = currency,
            submitting = returnSubmitting,
            error = returnError,
            onDismiss = { showReturn = false },
            onSubmit = { items, reason, method -> onReturn(items, reason, method) },
        )
    }
}

@Composable
private fun ReturnDialog(
    sale: Sale,
    currency: String,
    submitting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (List<Triple<String, Int, Boolean>>, String?, String?) -> Unit,
) {
    val quantities = remember { mutableStateMapOf<String, Int>() }
    val restock = remember { mutableStateMapOf<String, Boolean>() }
    var reason by remember { mutableStateOf("") }
    var method by remember { mutableStateOf(sale.paymentMethod.ifBlank { "CASH" }) }

    val estimatedRefund = sale.items.sumOf { item ->
        val qty = quantities[item.productId] ?: 0
        if (qty <= 0) 0.0 else (if (item.quantity > 0) item.lineTotal / item.quantity else item.unitPrice) * qty
    }

    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(16.dp), color = StockMateColors.Panel) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 560.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
            ) {
                Text("Return / Refund", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = StockMateColors.Slate900)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Set how many of each item to return. Untick restock for damaged items.",
                    style = MaterialTheme.typography.bodySmall,
                    color = StockMateColors.Slate500,
                )
                Spacer(Modifier.height(12.dp))

                sale.items.forEach { item ->
                    val qty = quantities[item.productId] ?: 0
                    val doRestock = restock[item.productId] ?: true
                    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = "${item.productName} (max ${item.quantity})",
                                style = MaterialTheme.typography.bodySmall,
                                color = StockMateColors.Slate800,
                                modifier = Modifier.weight(1f),
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconButton(onClick = { if (qty > 0) quantities[item.productId] = qty - 1 }) {
                                    Icon(Icons.Default.Remove, contentDescription = "Less", tint = StockMateColors.Slate600)
                                }
                                Text("$qty", fontWeight = FontWeight.SemiBold, color = StockMateColors.Slate900)
                                IconButton(onClick = { if (qty < item.quantity) quantities[item.productId] = qty + 1 }) {
                                    Icon(Icons.Default.Add, contentDescription = "More", tint = StockMateColors.Brand600)
                                }
                            }
                        }
                        if (qty > 0) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(
                                    checked = doRestock,
                                    onCheckedChange = { restock[item.productId] = it },
                                    colors = CheckboxDefaults.colors(checkedColor = StockMateColors.Brand600),
                                )
                                Text("Restock to inventory", style = MaterialTheme.typography.bodySmall, color = StockMateColors.Slate600)
                            }
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = method,
                    onValueChange = { method = it },
                    label = { Text("Refund method") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = StockMateOutlinedFieldColors(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("Reason (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = StockMateOutlinedFieldColors(),
                )

                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Estimated refund", color = StockMateColors.Slate700, fontWeight = FontWeight.SemiBold)
                    Text(formatCurrency(estimatedRefund, currency), color = StockMateColors.Slate900, fontWeight = FontWeight.Bold)
                }

                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error, color = StockMateColors.Red600, style = MaterialTheme.typography.bodySmall)
                }

                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f)) {
                        StockMateSecondaryButton(text = "Cancel", onClick = onDismiss, enabled = !submitting)
                    }
                    Box(Modifier.weight(1f)) {
                        StockMatePrimaryButton(
                            text = "Refund",
                            onClick = {
                                val items = sale.items.mapNotNull { item ->
                                    val q = quantities[item.productId] ?: 0
                                    if (q > 0) Triple(item.productId, q, restock[item.productId] ?: true) else null
                                }
                                if (items.isNotEmpty()) onSubmit(items, reason.ifBlank { null }, method.ifBlank { null })
                            },
                            enabled = !submitting && estimatedRefund > 0,
                            loading = submitting,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceiptContent(sale: Sale, currency: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text("SALE RECEIPT", style = MaterialTheme.typography.titleLarge, fontFamily = FontFamily.Monospace)
        Text("Receipt #${sale.id.takeLast(8).uppercase()}", fontFamily = FontFamily.Monospace)
        Text(formatDate(sale.createdAt), fontFamily = FontFamily.Monospace)
        Text("Cashier: ${sale.cashierName}", fontFamily = FontFamily.Monospace)
        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
        sale.items.forEach { item ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    "${item.quantity}x ${item.productName}",
                    modifier = Modifier.weight(1f),
                    fontFamily = FontFamily.Monospace,
                )
                Text(formatCurrency(item.lineTotal, currency), fontFamily = FontFamily.Monospace)
            }
        }
        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
        ReceiptLine("Subtotal", sale.subtotal, currency)
        if (sale.discount > 0) ReceiptLine("Promo discount", -sale.discount, currency)
        if (sale.pwdSeniorDiscountAmount > 0) {
            ReceiptLine("PWD / Senior (20%)", -sale.pwdSeniorDiscountAmount, currency)
        }
        if (sale.tax > 0) ReceiptLine("Tax", sale.tax, currency)
        ReceiptLine("Total", sale.total, currency, bold = true)
        Text("Payment: ${sale.paymentMethod}", fontFamily = FontFamily.Monospace)
        sale.paymentReference?.takeIf { it.isNotBlank() }?.let { ref ->
            Text("Ref: $ref", fontFamily = FontFamily.Monospace)
        }
        sale.amountTendered?.let { tendered ->
            ReceiptLine("Tendered", tendered, currency)
        }
        sale.changeGiven?.let { change ->
            ReceiptLine("Change", change, currency, bold = true)
        }
        Text("Thank you!", fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 16.dp))
    }
}

@Composable
private fun ReceiptLine(label: String, amount: Double, currency: String, bold: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            label,
            fontFamily = FontFamily.Monospace,
            style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
        )
        Text(
            formatCurrency(amount, currency),
            fontFamily = FontFamily.Monospace,
            style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
        )
    }
}

private fun formatDate(timestamp: Long): String {
    val fmt = SimpleDateFormat("MMM d, yyyy h:mm a", Locale.getDefault())
    return fmt.format(Date(timestamp))
}
