package com.stockmate.pos.navigation

import androidx.compose.runtime.Composable
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
                onNavigate = { route -> navController.navigate(route) },
                onSignOut = onSignOut,
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
            )
        }

        composable(
            route = NavRoutes.RECEIPT_DETAIL,
            arguments = listOf(navArgument("saleId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val saleId = backStackEntry.arguments?.getString("saleId") ?: return@composable
            val state by receiptViewModel.uiState.collectAsState()
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
            )
        }

        composable(NavRoutes.BLUETOOTH_PRINTER) {
            BluetoothPrinterScreen(
                onBack = { navController.popBackStack() },
            )
        }
    }
}
