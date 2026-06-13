package com.stockmate.pos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import com.stockmate.pos.navigation.NavRoutes
import com.stockmate.pos.navigation.StockMateNavHost
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.screens.LoginScreen
import com.stockmate.pos.ui.theme.StockMateTheme
import com.stockmate.pos.viewmodel.AuthViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            StockMateTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    StockMateRoot()
                }
            }
        }
    }
}

@Composable
private fun StockMateRoot() {
    val authViewModel: AuthViewModel = viewModel()
    val authState by authViewModel.uiState.collectAsState()
    val navController = rememberNavController()

    when {
        authState.isLoading -> LoadingBox()
        authState.user == null -> LoginScreen(viewModel = authViewModel)
        else -> {
            val user = authState.user!!
            StockMateNavHost(
                navController = navController,
                user = user,
                storeName = authState.store?.name ?: "StockMate POS",
                onSignOut = {
                    authViewModel.signOut()
                    navController.navigate(NavRoutes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
    }
}
