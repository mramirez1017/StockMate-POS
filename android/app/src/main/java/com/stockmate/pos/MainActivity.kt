package com.stockmate.pos

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import com.stockmate.pos.ui.theme.StockMateColors
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import com.stockmate.pos.navigation.StockMateNavHost
import com.stockmate.pos.ui.components.LoadingBox
import com.stockmate.pos.ui.screens.LoginScreen
import com.stockmate.pos.ui.theme.StockMateTheme
import com.stockmate.pos.viewmodel.AuthViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Navy brand surface across the app -> force light (white) status bar icons.
        // Bottom bars/content stay light, so leave the navigation bar icons on auto.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        setContent {
            StockMateTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = StockMateColors.Background,
                ) {
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

    when {
        authState.isCheckingSession -> LoadingBox()
        authState.user == null -> LoginScreen(viewModel = authViewModel)
        else -> {
            val user = authState.user!!
            // Fresh nav stack per signed-in session (avoids stale routes after logout).
            val navController = rememberNavController()
            StockMateNavHost(
                navController = navController,
                user = user,
                storeName = authState.store?.name ?: "StockMate POS",
                onSignOut = { authViewModel.signOut() },
            )
        }
    }
}
