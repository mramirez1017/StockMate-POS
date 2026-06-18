package com.stockmate.pos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.User
import com.stockmate.pos.data.models.UserRole
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
    val roles: Set<UserRole>,
)

/** Web-aligned, human-friendly role label (web shows ADMIN as "Store Owner"). */
private fun roleDisplayName(role: UserRole): String = when (role) {
    UserRole.OWNER -> "Owner"
    UserRole.ADMIN -> "Store Owner"
    UserRole.STORE_MANAGER -> "Store Manager"
    UserRole.CASHIER -> "Cashier"
}

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

    val allRoles = setOf(UserRole.OWNER, UserRole.ADMIN, UserRole.STORE_MANAGER, UserRole.CASHIER)
    val managerUp = setOf(UserRole.OWNER, UserRole.ADMIN, UserRole.STORE_MANAGER)

    val actions = listOf(
        HomeAction("POS (New Sale)", "Create new sale / transaction", NavRoutes.POS, Icons.Default.ShoppingCart, StockMateColors.Brand600, allRoles),
        HomeAction("Product Search", "Search product or scan", NavRoutes.SCAN_PRODUCT, Icons.Default.Search, StockMateColors.Violet500, allRoles),
        HomeAction("Receipts", "View recent sales", NavRoutes.RECEIPT, Icons.AutoMirrored.Filled.ReceiptLong, StockMateColors.Teal600, allRoles),
        HomeAction("Assign Barcode", "Tag unlabeled products", NavRoutes.ASSIGN_BARCODE, Icons.Default.QrCodeScanner, StockMateColors.Violet500, allRoles),
        HomeAction("Receive Delivery", "Verify and receive items", NavRoutes.RECEIVE_DELIVERY, Icons.Default.LocalShipping, StockMateColors.Sky500, managerUp),
        HomeAction("Stock Disposal", "Tag expired/damaged items", NavRoutes.STOCK_DISPOSAL, Icons.Default.DeleteOutline, StockMateColors.Amber500, managerUp),
        HomeAction("Critical Stock", "Low stock alerts", NavRoutes.CRITICAL_STOCKS, Icons.Default.Warning, StockMateColors.Amber500, managerUp),
        HomeAction("Stock Transfers", "Move stock between branches", NavRoutes.STOCK_TRANSFERS, Icons.Default.SwapHoriz, StockMateColors.Sky500, managerUp),
        HomeAction("Stock Count", "Reconcile physical inventory", NavRoutes.STOCK_COUNTS, Icons.Default.ClearAll, StockMateColors.Teal600, managerUp),
        HomeAction("Request Access", "Ask for elevated access", NavRoutes.ACCESS_REQUESTS, Icons.Default.Key, StockMateColors.Violet500, setOf(UserRole.CASHIER, UserRole.STORE_MANAGER)),
        HomeAction("Access Requests", "Review staff access", NavRoutes.ACCESS_REQUESTS, Icons.Default.VerifiedUser, StockMateColors.Brand600, setOf(UserRole.ADMIN, UserRole.OWNER)),
    ).filter { user.role in it.roles }

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
                GreetingHeader(
                    fullName = user.fullName,
                    roleLabel = roleDisplayName(user.role),
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

/** Personalized, branded greeting hero shown atop the dashboard. */
@Composable
private fun GreetingHeader(
    fullName: String,
    roleLabel: String,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = StockMateColors.Brand600,
        shadowElevation = 2.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        listOf(StockMateColors.Brand500, StockMateColors.Brand700),
                    ),
                )
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                modifier = Modifier.size(44.dp),
                shape = CircleShape,
                color = Color.White.copy(alpha = 0.20f),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = userInitials(fullName),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = greetingForNow(),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.85f),
                )
                Text(
                    text = fullName,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = Color.White.copy(alpha = 0.20f),
            ) {
                Text(
                    text = roleLabel,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    maxLines = 1,
                )
            }
        }
    }
}

private fun greetingForNow(): String {
    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    return when {
        hour < 12 -> "Good morning"
        hour < 18 -> "Good afternoon"
        else -> "Good evening"
    }
}
