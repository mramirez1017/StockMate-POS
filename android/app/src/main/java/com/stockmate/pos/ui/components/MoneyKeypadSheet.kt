package com.stockmate.pos.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.stockmate.pos.util.PosCheckout

@Composable
fun MoneyKeypadSheet(
    title: String,
    amount: String,
    totalDue: Double,
    onAmountChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    val tendered = PosCheckout.parseMoney(amount)
    val change = if (tendered != null && PosCheckout.tenderCoversTotal(tendered, totalDue)) {
        PosCheckout.roundMoney(tendered - totalDue)
    } else {
        null
    }
    val sufficient = tendered != null && PosCheckout.tenderCoversTotal(tendered, totalDue)

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            tonalElevation = 6.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(title, style = MaterialTheme.typography.titleLarge)
                Spacer(modifier = Modifier.height(12.dp))

                Surface(
                    tonalElevation = 2.dp,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = if (amount.isBlank()) "0.00" else amount,
                            style = MaterialTheme.typography.displaySmall,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.End,
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Total due", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(formatCurrency(totalDue))
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Change", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                text = when {
                                    tendered == null -> "—"
                                    !sufficient -> "Insufficient"
                                    else -> formatCurrency(change ?: 0.0)
                                },
                                color = if (sufficient) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.error
                                },
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = { onAmountChange(PosCheckout.formatMoneyForInput(totalDue)) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Exact")
                    }
                    OutlinedButton(
                        onClick = { onAmountChange("") },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Clear")
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                KeypadGrid(
                    onKey = { key ->
                        when (key) {
                            "backspace" -> if (amount.isNotEmpty()) onAmountChange(amount.dropLast(1))
                            else -> onAmountChange(PosCheckout.sanitizeMoneyInput(amount + key))
                        }
                    },
                )

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = onConfirm,
                    enabled = sufficient,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Done")
                }
            }
        }
    }
}

@Composable
private fun KeypadGrid(onKey: (String) -> Unit) {
    val rows = listOf(
        listOf("7", "8", "9"),
        listOf("4", "5", "6"),
        listOf("1", "2", "3"),
        listOf(".", "0", "backspace"),
    )

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                row.forEach { key ->
                    KeypadButton(
                        label = key,
                        modifier = Modifier.weight(1f),
                        onClick = { onKey(key) },
                    )
                }
            }
        }
    }
}

@Composable
private fun KeypadButton(
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    FilledTonalButton(
        onClick = onClick,
        modifier = modifier.height(56.dp),
        shape = RoundedCornerShape(12.dp),
        contentPadding = PaddingValues(0.dp),
    ) {
        if (label == "backspace") {
            Icon(Icons.AutoMirrored.Filled.Backspace, contentDescription = "Backspace")
        } else {
            Text(label, style = MaterialTheme.typography.headlineSmall)
        }
    }
}
