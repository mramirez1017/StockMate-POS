package com.stockmate.pos.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val LightColorScheme = lightColorScheme(
    primary = StockMateColors.Brand600,
    onPrimary = Color.White,
    primaryContainer = StockMateColors.Brand50,
    onPrimaryContainer = StockMateColors.Brand700,
    secondary = StockMateColors.Teal600,
    onSecondary = Color.White,
    tertiary = StockMateColors.Violet500,
    background = StockMateColors.Background,
    onBackground = StockMateColors.Slate800,
    surface = StockMateColors.Panel,
    onSurface = StockMateColors.Slate800,
    surfaceVariant = StockMateColors.Slate100,
    onSurfaceVariant = StockMateColors.Slate500,
    outline = StockMateColors.Border,
    outlineVariant = StockMateColors.Slate200,
    error = StockMateColors.Red600,
    onError = Color.White,
)

private val StockMateShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp),
)

@Composable
fun StockMateTheme(
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        typography = Typography,
        shapes = StockMateShapes,
        content = content,
    )
}
