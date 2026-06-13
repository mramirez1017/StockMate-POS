package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.User
import com.stockmate.pos.navigation.NavRoutes
import com.stockmate.pos.ui.components.HomeActionCard
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.formatCurrency
import com.stockmate.pos.viewmodel.HomeViewModel

@Composable
fun HomeScreen(
    user: User,
    storeName: String,
    viewModel: HomeViewModel,
    onNavigate: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(user.id) {
        viewModel.loadStats(user)
    }

    Scaffold(
        topBar = {
            StockMateTopBar(
                title = storeName.ifBlank { "StockMate POS" },
                actions = {
                    IconButton(onClick = onSignOut) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sign out")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Hello, ${user.fullName}",
                style = MaterialTheme.typography.titleMedium,
            )
            uiState.stats?.let { stats ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    StatChip(
                        label = "Today Sales",
                        value = formatCurrency(stats.todaySales),
                        modifier = Modifier.weight(1f),
                    )
                    StatChip(
                        label = "Critical",
                        value = stats.criticalStockCount.toString(),
                        modifier = Modifier.weight(1f),
                    )
                    StatChip(
                        label = "Deliveries",
                        value = stats.pendingDeliveries.toString(),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            HomeActionCard(
                title = "POS",
                subtitle = "Scan, add to cart, checkout",
                onClick = { onNavigate(NavRoutes.POS) },
            )
            HomeActionCard(
                title = "Receive Delivery",
                subtitle = "Check in incoming purchase orders",
                onClick = { onNavigate(NavRoutes.RECEIVE_DELIVERY) },
            )
            HomeActionCard(
                title = "Assign Barcode",
                subtitle = "Scan product labels for items without a barcode",
                onClick = { onNavigate(NavRoutes.ASSIGN_BARCODE) },
            )
            HomeActionCard(
                title = "Scan Product",
                subtitle = "Look up price and stock",
                onClick = { onNavigate(NavRoutes.SCAN_PRODUCT) },
            )
            HomeActionCard(
                title = "Critical Stock",
                subtitle = "Low stock alerts and purchase requests",
                onClick = { onNavigate(NavRoutes.CRITICAL_STOCKS) },
            )
            HomeActionCard(
                title = "Stock Disposal",
                subtitle = "Record expired or damaged items",
                onClick = { onNavigate(NavRoutes.STOCK_DISPOSAL) },
            )
            HomeActionCard(
                title = "Receipts",
                subtitle = "View and print recent sales",
                onClick = { onNavigate(NavRoutes.RECEIPT) },
            )
        }
    }
}

@Composable
private fun StatChip(label: String, value: String, modifier: Modifier = Modifier) {
    ElevatedCard(modifier = modifier) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(text = label, style = MaterialTheme.typography.labelMedium)
            Text(text = value, style = MaterialTheme.typography.titleMedium)
        }
    }
}
