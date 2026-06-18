package com.stockmate.pos.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.screens.*
import com.stockmate.pos.viewmodel.*

@Composable
fun StockMateNavHost(
    navController: NavHostController,
    user: User,
    storeName: String,
    onSignOut: () -> Unit,
) {
    val posViewModel: PosViewModel = viewModel()
    val deliveryViewModel: DeliveryViewModel = viewModel()
    val disposalViewModel: DisposalViewModel = viewModel()
    val criticalStockViewModel: CriticalStockViewModel = viewModel()
    val receiptViewModel: ReceiptViewModel = viewModel()
    val notificationsViewModel: NotificationsViewModel = viewModel()
    val threadViewModel: ThreadViewModel = viewModel()

    LaunchedEffect(user.id) {
        notificationsViewModel.start(user.storeId, user.id)
    }
    val notifState by notificationsViewModel.uiState.collectAsState()

    NavHost(
        navController = navController,
        startDestination = NavRoutes.HOME,
    ) {
        composable(NavRoutes.HOME) {
            val homeViewModel: HomeViewModel = viewModel()
            HomeScreen(
                user = user,
                storeName = storeName,
                viewModel = homeViewModel,
                unreadCount = notifState.unreadCount,
                onOpenNotifications = { navController.navigate(NavRoutes.NOTIFICATIONS) },
                onNavigate = { route -> navController.navigate(route) },
                onSignOut = onSignOut,
            )
        }

        composable(NavRoutes.NOTIFICATIONS) {
            NotificationsScreen(
                user = user,
                viewModel = notificationsViewModel,
                onOpen = { notification ->
                    val type = notification.refType
                    val id = notification.refId
                    when {
                        (type == "PURCHASE_ORDER" || type == "DELIVERY") && !id.isNullOrBlank() ->
                            navController.navigate(NavRoutes.deliveryChecklist(id))
                        type == "PERMISSION_REQUEST" ->
                            navController.navigate(NavRoutes.ACCESS_REQUESTS)
                        type == "STOCK_TRANSFER" ->
                            navController.navigate(NavRoutes.STOCK_TRANSFERS)
                        type == "STOCK_COUNT" ->
                            navController.navigate(NavRoutes.STOCK_COUNTS)
                    }
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = NavRoutes.MESSAGES,
            arguments = listOf(navArgument("poId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val poId = backStackEntry.arguments?.getString("poId") ?: return@composable
            val deliveryState by deliveryViewModel.uiState.collectAsState()
            LaunchedEffect(poId) {
                if (deliveryViewModel.uiState.value.selectedPo?.id != poId) {
                    deliveryViewModel.selectPurchaseOrder(user, poId)
                }
            }
            val po = deliveryState.selectedPo?.takeIf { it.id == poId }
            MessageThreadScreen(
                user = user,
                contextType = "PURCHASE_ORDER",
                contextId = poId,
                title = po?.let { "Delivery ${it.poNumber}" } ?: "Delivery chat",
                branchId = po?.branchId ?: user.branchId,
                viewModel = threadViewModel,
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.POS) {
            PosScreen(
                user = user,
                viewModel = posViewModel,
                onNavigateToSearch = { navController.navigate(NavRoutes.PRODUCT_SEARCH) },
                onNavigateToPrinter = { navController.navigate(NavRoutes.BLUETOOTH_PRINTER) },
                onCheckoutSuccess = { sale ->
                    receiptViewModel.setSale(sale)
                    navController.navigate(NavRoutes.RECEIPT) {
                        popUpTo(NavRoutes.POS) { inclusive = false }
                    }
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.PRODUCT_SEARCH) {
            val searchViewModel: ProductSearchViewModel = viewModel()
            ProductSearchScreen(
                user = user,
                viewModel = searchViewModel,
                onProductSelected = { product ->
                    posViewModel.addProduct(product)
                    navController.popBackStack()
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.RECEIVE_DELIVERY) {
            ReceiveDeliveryScreen(
                user = user,
                viewModel = deliveryViewModel,
                onOpenChecklist = { poId ->
                    navController.navigate(NavRoutes.deliveryChecklist(poId))
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = NavRoutes.DELIVERY_CHECKLIST,
            arguments = listOf(navArgument("poId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val poId = backStackEntry.arguments?.getString("poId") ?: return@composable
            DeliveryChecklistScreen(
                user = user,
                poId = poId,
                viewModel = deliveryViewModel,
                onOpenChat = { navController.navigate(NavRoutes.messages(poId)) },
                onSubmitted = {
                    navController.popBackStack(NavRoutes.RECEIVE_DELIVERY, inclusive = false)
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.SCAN_PRODUCT) {
            val scanViewModel: ScanProductViewModel = viewModel()
            ScanProductScreen(
                user = user,
                viewModel = scanViewModel,
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.ASSIGN_BARCODE) {
            val assignViewModel: AssignBarcodeViewModel = viewModel()
            AssignBarcodeScreen(
                user = user,
                viewModel = assignViewModel,
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.STOCK_DISPOSAL) {
            StockDisposalScreen(
                user = user,
                viewModel = disposalViewModel,
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.CRITICAL_STOCKS) {
            CriticalStocksScreen(
                user = user,
                viewModel = criticalStockViewModel,
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.RECEIPT) {
            val state by receiptViewModel.uiState.collectAsState()
            val canReturn = user.role == com.stockmate.pos.data.models.UserRole.ADMIN ||
                user.role == com.stockmate.pos.data.models.UserRole.OWNER ||
                user.role == com.stockmate.pos.data.models.UserRole.STORE_MANAGER
            ReceiptScreen(
                sale = state.sale,
                currency = "PHP",
                onPrint = { navController.navigate(NavRoutes.BLUETOOTH_PRINTER) },
                onNewSale = {
                    posViewModel.clearCart()
                    navController.navigate(NavRoutes.POS) {
                        popUpTo(NavRoutes.HOME)
                    }
                },
                onViewHistory = { saleId ->
                    navController.navigate(NavRoutes.receiptDetail(saleId))
                },
                onLoadHistory = { receiptViewModel.loadRecentSales(user) },
                recentSales = state.recentSales,
                isLoading = state.isLoading,
                onBack = { navController.popBackStack() },
                canReturn = canReturn,
                returnSubmitting = state.returnSubmitting,
                returnNotice = state.returnNotice,
                returnError = state.returnError,
                onReturn = { items, reason, method ->
                    state.sale?.let { receiptViewModel.processReturn(user, it.id, items, reason, method) }
                },
                onConsumeReturnMessages = { receiptViewModel.consumeReturnMessages() },
            )
        }

        composable(
            route = NavRoutes.RECEIPT_DETAIL,
            arguments = listOf(navArgument("saleId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val saleId = backStackEntry.arguments?.getString("saleId") ?: return@composable
            val state by receiptViewModel.uiState.collectAsState()
            val canReturn = user.role == com.stockmate.pos.data.models.UserRole.ADMIN ||
                user.role == com.stockmate.pos.data.models.UserRole.OWNER ||
                user.role == com.stockmate.pos.data.models.UserRole.STORE_MANAGER
            ReceiptScreen(
                sale = state.sale,
                currency = "PHP",
                onPrint = { navController.navigate(NavRoutes.BLUETOOTH_PRINTER) },
                onNewSale = {
                    posViewModel.clearCart()
                    navController.navigate(NavRoutes.POS) {
                        popUpTo(NavRoutes.HOME)
                    }
                },
                onViewHistory = {},
                onLoadHistory = { receiptViewModel.loadSale(user, saleId) },
                recentSales = emptyList(),
                isLoading = state.isLoading,
                onBack = { navController.popBackStack() },
                canReturn = canReturn,
                returnSubmitting = state.returnSubmitting,
                returnNotice = state.returnNotice,
                returnError = state.returnError,
                onReturn = { items, reason, method ->
                    receiptViewModel.processReturn(user, saleId, items, reason, method)
                },
                onConsumeReturnMessages = { receiptViewModel.consumeReturnMessages() },
            )
        }

        composable(NavRoutes.BLUETOOTH_PRINTER) {
            BluetoothPrinterScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.ACCESS_REQUESTS) {
            val accessViewModel: AccessRequestsViewModel = viewModel()
            AccessRequestsScreen(
                user = user,
                viewModel = accessViewModel,
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.STOCK_TRANSFERS) {
            val transfersViewModel: StockTransfersViewModel = viewModel()
            StockTransfersScreen(
                user = user,
                viewModel = transfersViewModel,
                onBack = { navController.popBackStack() },
            )
        }

        composable(NavRoutes.STOCK_COUNTS) {
            val stockCountViewModel: StockCountViewModel = viewModel()
            StockCountScreen(
                user = user,
                viewModel = stockCountViewModel,
                onBack = { navController.popBackStack() },
            )
        }
    }
}
