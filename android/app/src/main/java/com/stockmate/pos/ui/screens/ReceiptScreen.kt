package com.stockmate.pos.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.Sale
import com.stockmate.pos.ui.components.EmptyState
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.formatCurrency
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
) {
    LaunchedEffect(Unit) {
        if (sale == null) onLoadHistory()
    }

    Scaffold(
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
                Surface(tonalElevation = 3.dp) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(onClick = onPrint, modifier = Modifier.weight(1f)) {
                            Text("Print")
                        }
                        Button(onClick = onNewSale, modifier = Modifier.weight(1f)) {
                            Text("New Sale")
                        }
                    }
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
