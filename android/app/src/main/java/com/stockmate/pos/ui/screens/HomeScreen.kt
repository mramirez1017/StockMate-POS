package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.User
import com.stockmate.pos.navigation.NavRoutes
import com.stockmate.pos.ui.components.*
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.viewmodel.HomeViewModel

private data class HomeAction(
    val title: String,
    val description: String,
    val route: String,
    val icon: ImageVector,
    val iconBackground: androidx.compose.ui.graphics.Color,
)

@Composable
fun HomeScreen(
    user: User,
    storeName: String,
    viewModel: HomeViewModel,
    unreadCount: Int = 0,
    onOpenNotifications: () -> Unit = {},
    onNavigate: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(user.id) {
        viewModel.loadStats(user)
    }

    val actions = listOf(
        HomeAction("POS (New Sale)", "Create new sale / transaction", NavRoutes.POS, Icons.Default.ShoppingCart, StockMateColors.Brand600),
        HomeAction("Receive Delivery", "Verify and receive items", NavRoutes.RECEIVE_DELIVERY, Icons.Default.LocalShipping, StockMateColors.Sky500),
        HomeAction("Stock Disposal", "Tag expired/damaged items", NavRoutes.STOCK_DISPOSAL, Icons.Default.DeleteOutline, StockMateColors.Amber500),
        HomeAction("Product Search", "Search product or scan", NavRoutes.SCAN_PRODUCT, Icons.Default.Search, StockMateColors.Violet500),
        HomeAction("Receipts", "View recent sales", NavRoutes.RECEIPT, Icons.AutoMirrored.Filled.ReceiptLong, StockMateColors.Teal600),
        HomeAction("Assign Barcode", "Tag unlabeled products", NavRoutes.ASSIGN_BARCODE, Icons.Default.QrCodeScanner, StockMateColors.Violet500),
        HomeAction("Critical Stock", "Low stock alerts", NavRoutes.CRITICAL_STOCKS, Icons.Default.Warning, StockMateColors.Amber500),
    )

    StockMateScaffold(
        topBar = {
            StockMateAppTopBar(
                title = "Dashboard",
                contextLabel = storeName.ifBlank { null },
                onSignOut = onSignOut,
                actions = {
                    IconButton(onClick = onOpenNotifications) {
                        BadgedBox(
                            badge = {
                                if (unreadCount > 0) {
                                    Badge { Text(if (unreadCount > 99) "99+" else unreadCount.toString()) }
                                }
                            },
                        ) {
                            Icon(
                                Icons.Default.Notifications,
                                contentDescription = "Notifications",
                                tint = StockMateColors.Slate600,
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(bottom = 16.dp),
        ) {
            StockMateScreenPadding {
                StockMateUserCard(
                    fullName = user.fullName,
                    roleLabel = user.role.name,
                )

                uiState.stats?.let { stats ->
                    StockMateTwoColumnGrid(spacing = 12.dp) {
                        DashboardStatCard(
                            label = "Today's Sales",
                            value = formatCurrency(stats.todaySales),
                            icon = Icons.Default.Payments,
                            iconBackground = StockMateColors.Brand100,
                            iconTint = StockMateColors.Brand600,
                            trend = "Live today",
                        )
                        DashboardStatCard(
                            label = "Transactions",
                            value = stats.todayTransactions.toString(),
                            icon = Icons.Default.ShoppingBag,
                            iconBackground = StockMateColors.Sky100,
                            iconTint = StockMateColors.Sky600,
                        )
                        DashboardStatCard(
                            label = "Critical Stock",
                            value = stats.criticalStockCount.toString(),
                            icon = Icons.Default.Warning,
                            iconBackground = StockMateColors.Amber100,
                            iconTint = StockMateColors.Amber600,
                            onClick = { onNavigate(NavRoutes.CRITICAL_STOCKS) },
                        )
                        DashboardStatCard(
                            label = "Deliveries",
                            value = stats.pendingDeliveries.toString(),
                            icon = Icons.Default.LocalShipping,
                            iconBackground = StockMateColors.Violet100,
                            iconTint = StockMateColors.Violet600,
                            onClick = { onNavigate(NavRoutes.RECEIVE_DELIVERY) },
                        )
                    }
                } ?: run {
                    if (uiState.isLoading) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 24.dp),
                            contentAlignment = androidx.compose.ui.Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = StockMateColors.Brand600)
                        }
                    }
                }

                SectionHeading(text = "Quick actions", modifier = Modifier.padding(top = 4.dp))

                StockMateTwoColumnGrid(spacing = 12.dp) {
                    actions.forEach { action ->
                        QuickActionTile(
                            title = action.title,
                            description = action.description,
                            icon = action.icon,
                            iconBackground = action.iconBackground,
                            onClick = { onNavigate(action.route) },
                        )
                    }
                }
            }
        }
    }
}
