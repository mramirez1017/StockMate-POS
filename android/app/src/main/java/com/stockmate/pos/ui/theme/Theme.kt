package com.stockmate.pos.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
    primary = StockMateBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFBBDEFB),
    secondary = StockMateTeal,
    onSecondary = Color.White,
    tertiary = StockMateOrange,
    background = StockMateSurface,
    surface = Color.White,
    error = StockMateRed,
)

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF90CAF9),
    onPrimary = Color(0xFF0D47A1),
    primaryContainer = StockMateBlueDark,
    secondary = Color(0xFF4DB6AC),
    onSecondary = Color.Black,
    tertiary = Color(0xFFFFB74D),
    background = Color(0xFF121212),
    surface = Color(0xFF1E1E1E),
    error = Color(0xFFEF9A9A),
)

@Composable
fun StockMateTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
