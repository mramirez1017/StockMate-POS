package com.stockmate.pos.ui.components



import androidx.compose.foundation.BorderStroke

import androidx.compose.foundation.Image

import androidx.compose.foundation.background

import androidx.compose.foundation.layout.*

import androidx.compose.foundation.shape.CircleShape

import androidx.compose.foundation.shape.RoundedCornerShape

import androidx.compose.material.icons.Icons

import androidx.compose.material.icons.automirrored.filled.ArrowBack

import androidx.compose.material.icons.automirrored.filled.Logout

import androidx.compose.material.icons.filled.Business

import androidx.compose.material3.*

import androidx.compose.runtime.Composable

import androidx.compose.ui.Alignment

import androidx.compose.ui.Modifier

import androidx.compose.ui.graphics.Brush

import androidx.compose.ui.graphics.Color

import androidx.compose.ui.graphics.vector.ImageVector

import androidx.compose.ui.layout.Layout

import androidx.compose.ui.res.painterResource

import androidx.compose.ui.text.font.FontWeight

import androidx.compose.ui.text.style.TextAlign

import androidx.compose.ui.text.style.TextOverflow

import androidx.compose.ui.unit.Dp

import androidx.compose.ui.unit.dp

import androidx.compose.ui.unit.sp

import com.stockmate.pos.R

import com.stockmate.pos.ui.theme.StockMateColors

import java.text.NumberFormat

import java.util.Locale



@OptIn(ExperimentalMaterial3Api::class)

@Composable

fun StockMateScaffold(

    modifier: Modifier = Modifier,

    topBar: @Composable () -> Unit = {},

    bottomBar: @Composable () -> Unit = {},

    floatingActionButton: @Composable () -> Unit = {},

    content: @Composable (PaddingValues) -> Unit,

) {

    Scaffold(

        modifier = modifier,

        containerColor = StockMateColors.Background,

        topBar = topBar,

        bottomBar = bottomBar,

        floatingActionButton = floatingActionButton,

        contentWindowInsets = WindowInsets.safeDrawing.only(

            WindowInsetsSides.Horizontal + WindowInsetsSides.Top,

        ),

        content = content,

    )

}



@Composable

fun StockMateScreenPadding(

    modifier: Modifier = Modifier,

    content: @Composable ColumnScope.() -> Unit,

) {

    Column(

        modifier = modifier

            .fillMaxWidth()

            .padding(horizontal = 12.dp, vertical = 12.dp),

        verticalArrangement = Arrangement.spacedBy(12.dp),

        content = content,

    )

}



@Composable

fun StockMateBottomBar(

    modifier: Modifier = Modifier,

    content: @Composable ColumnScope.() -> Unit,

) {

    Surface(

        modifier = modifier.fillMaxWidth(),

        color = StockMateColors.Panel,

        shadowElevation = 8.dp,

    ) {

        Column(

            modifier = Modifier

                .fillMaxWidth()

                // Float above the on-screen keyboard when it's open; otherwise
                // just clear the navigation bar.

                .windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime))

                .padding(horizontal = 16.dp, vertical = 12.dp),

            verticalArrangement = Arrangement.spacedBy(8.dp),

            content = content,

        )

    }

}



@OptIn(ExperimentalMaterial3Api::class)

@Composable

fun StockMateAppTopBar(

    title: String,

    contextLabel: String? = null,

    onBack: (() -> Unit)? = null,

    onSignOut: (() -> Unit)? = null,

    actions: @Composable RowScope.() -> Unit = {},

) {

    Surface(color = StockMateColors.Navy900, shadowElevation = 3.dp) {

        Column(
            modifier = Modifier.background(
                Brush.verticalGradient(
                    listOf(StockMateColors.Navy800, StockMateColors.Navy900),
                ),
            ),
        ) {

            TopAppBar(

                title = {

                    Text(

                        text = title,

                        style = MaterialTheme.typography.titleMedium,

                        fontWeight = FontWeight.SemiBold,

                        color = Color.White,

                        maxLines = 1,

                        overflow = TextOverflow.Ellipsis,

                    )

                },

                navigationIcon = {

                    if (onBack != null) {

                        IconButton(onClick = onBack) {

                            Icon(

                                Icons.AutoMirrored.Filled.ArrowBack,

                                contentDescription = "Back",

                                tint = Color.White,

                            )

                        }

                    } else {

                        Image(

                            painter = painterResource(R.drawable.sidebar_icon),

                            contentDescription = null,

                            modifier = Modifier

                                .padding(start = 12.dp)

                                .size(30.dp),

                        )

                    }

                },

                actions = {

                    actions()

                    if (onSignOut != null) {

                        IconButton(onClick = onSignOut) {

                            Icon(

                                Icons.AutoMirrored.Filled.Logout,

                                contentDescription = "Sign out",

                                tint = StockMateColors.Slate300,

                            )

                        }

                    }

                },

                colors = TopAppBarDefaults.topAppBarColors(

                    containerColor = Color.Transparent,

                    titleContentColor = Color.White,

                    navigationIconContentColor = Color.White,

                    actionIconContentColor = StockMateColors.Slate300,

                ),

            )

            if (!contextLabel.isNullOrBlank()) {

                StockMateContextBar(label = contextLabel)

            }

            HorizontalDivider(color = Color.White.copy(alpha = 0.10f), thickness = 1.dp)

        }

    }

}



@OptIn(ExperimentalMaterial3Api::class)

@Composable

fun StockMateTopBar(

    title: String,

    onBack: (() -> Unit)? = null,

    actions: @Composable RowScope.() -> Unit = {},

) {

    StockMateAppTopBar(

        title = title,

        onBack = onBack,

        actions = actions,

    )

}



@Composable

fun StockMateContextBar(

    label: String,

    modifier: Modifier = Modifier,

) {

    Surface(

        modifier = modifier.fillMaxWidth(),

        color = Color.Transparent,

    ) {

        Row(

            modifier = Modifier

                .fillMaxWidth()

                .padding(horizontal = 16.dp, vertical = 10.dp),

            verticalAlignment = Alignment.CenterVertically,

            horizontalArrangement = Arrangement.spacedBy(8.dp),

        ) {

            Icon(

                imageVector = Icons.Default.Business,

                contentDescription = null,

                tint = StockMateColors.Brand200,

                modifier = Modifier.size(16.dp),

            )

            Text(

                text = label,

                style = MaterialTheme.typography.bodySmall,

                fontWeight = FontWeight.Medium,

                color = Color.White.copy(alpha = 0.85f),

                maxLines = 1,

                overflow = TextOverflow.Ellipsis,

            )

        }

    }

}



@Composable

fun StockMateBrandRow(modifier: Modifier = Modifier) {

    Row(

        modifier = modifier,

        verticalAlignment = Alignment.CenterVertically,

        horizontalArrangement = Arrangement.spacedBy(8.dp),

    ) {

        Icon(

            painter = painterResource(R.drawable.sidebar_icon),

            contentDescription = null,

            modifier = Modifier.size(32.dp),

            tint = Color.Unspecified,

        )

        Row(

            verticalAlignment = Alignment.CenterVertically,

            horizontalArrangement = Arrangement.spacedBy(6.dp),

        ) {

            Text(

                text = "Stock",

                style = MaterialTheme.typography.titleLarge,

                fontWeight = FontWeight.Bold,

                color = StockMateColors.Slate800,

            )

            Text(

                text = "Mate",

                style = MaterialTheme.typography.titleLarge,

                fontWeight = FontWeight.Bold,

                color = StockMateColors.Brand600,

            )

            Surface(

                shape = RoundedCornerShape(6.dp),

                color = StockMateColors.Brand600,

            ) {

                Text(

                    text = "POS",

                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),

                    style = MaterialTheme.typography.labelSmall,

                    color = Color.White,

                    fontWeight = FontWeight.Bold,

                )

            }

        }

    }

}



@Composable

fun StockMateUserCard(

    fullName: String,

    roleLabel: String,

    branchLabel: String? = null,

    modifier: Modifier = Modifier,

) {

    StockMateCard(modifier = modifier) {

        Row(

            modifier = Modifier.fillMaxWidth(),

            verticalAlignment = Alignment.CenterVertically,

            horizontalArrangement = Arrangement.spacedBy(12.dp),

        ) {

            Surface(

                modifier = Modifier.size(40.dp),

                shape = CircleShape,

                color = StockMateColors.Brand100,

            ) {

                Box(contentAlignment = Alignment.Center) {

                    Text(

                        text = userInitials(fullName),

                        style = MaterialTheme.typography.labelLarge,

                        fontWeight = FontWeight.Bold,

                        color = StockMateColors.Brand700,

                    )

                }

            }

            Column(modifier = Modifier.weight(1f)) {

                Text(

                    text = fullName,

                    style = MaterialTheme.typography.bodyMedium,

                    fontWeight = FontWeight.SemiBold,

                    color = StockMateColors.Slate900,

                    maxLines = 1,

                    overflow = TextOverflow.Ellipsis,

                )

                Text(

                    text = roleLabel,

                    style = MaterialTheme.typography.bodySmall,

                    color = StockMateColors.Slate500,

                    maxLines = 1,

                    overflow = TextOverflow.Ellipsis,

                )

            }

        }

        if (!branchLabel.isNullOrBlank()) {

            Spacer(modifier = Modifier.height(12.dp))

            Text(

                text = "BRANCH",

                style = MaterialTheme.typography.labelSmall,

                fontWeight = FontWeight.SemiBold,

                color = StockMateColors.Slate400,

                letterSpacing = 0.5.sp,

            )

            Spacer(modifier = Modifier.height(4.dp))

            Surface(

                shape = RoundedCornerShape(8.dp),

                color = StockMateColors.Slate50,

                border = BorderStroke(1.dp, StockMateColors.Border),

            ) {

                Text(

                    text = branchLabel,

                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),

                    style = MaterialTheme.typography.bodySmall,

                    color = StockMateColors.Slate700,

                    maxLines = 1,

                    overflow = TextOverflow.Ellipsis,

                )

            }

        }

    }

}



@Composable

fun SectionHeading(

    text: String,

    modifier: Modifier = Modifier,

) {

    Text(

        text = text,

        modifier = modifier,

        style = MaterialTheme.typography.titleSmall,

        fontWeight = FontWeight.SemiBold,

        color = StockMateColors.Slate900,

    )

}



@Composable

fun StockMateCard(

    modifier: Modifier = Modifier,

    content: @Composable ColumnScope.() -> Unit,

) {

    Surface(

        modifier = modifier.fillMaxWidth(),

        shape = RoundedCornerShape(12.dp),

        color = StockMateColors.Panel,

        border = BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),

        shadowElevation = 1.dp,

    ) {

        Column(modifier = Modifier.padding(16.dp), content = content)

    }

}



@Composable

fun StockMateTwoColumnGrid(

    modifier: Modifier = Modifier,

    spacing: Dp = 12.dp,

    content: @Composable () -> Unit,

) {

    Layout(

        modifier = modifier.fillMaxWidth(),

        content = content,

    ) { measurables, constraints ->

        val gap = spacing.roundToPx()

        val columnWidth = (constraints.maxWidth - gap) / 2

        val itemConstraints = constraints.copy(

            minWidth = columnWidth,

            maxWidth = columnWidth,

        )



        val placeables = measurables.map { it.measure(itemConstraints) }

        val rowCount = (placeables.size + 1) / 2

        var maxRowHeight = 0

        val rowHeights = IntArray(rowCount)



        placeables.forEachIndexed { index, placeable ->

            val row = index / 2

            rowHeights[row] = maxOf(rowHeights[row], placeable.height)

        }

        val totalHeight = rowHeights.sum() + gap * (rowCount - 1).coerceAtLeast(0)



        layout(constraints.maxWidth, totalHeight) {

            var y = 0

            placeables.forEachIndexed { index, placeable ->

                val row = index / 2

                val col = index % 2

                if (col == 0 && index > 0) {

                    y += rowHeights[row - 1] + gap

                }

                val x = col * (columnWidth + gap)

                val rowHeight = rowHeights[row]

                placeable.place(x, y + (rowHeight - placeable.height) / 2)

            }

        }

    }

}



@Composable

fun DashboardStatCard(

    label: String,

    value: String,

    icon: ImageVector,

    iconBackground: Color,

    iconTint: Color,

    modifier: Modifier = Modifier,

    trend: String? = null,

    onClick: (() -> Unit)? = null,

) {

    val cardModifier = modifier

        .defaultMinSize(minHeight = 72.dp)

        .fillMaxWidth()



    val content: @Composable () -> Unit = {

        Row(

            modifier = Modifier

                .fillMaxWidth()

                .padding(horizontal = 12.dp, vertical = 12.dp),

            horizontalArrangement = Arrangement.spacedBy(10.dp),

            verticalAlignment = Alignment.Top,

        ) {

            Surface(

                modifier = Modifier.size(36.dp),

                shape = CircleShape,

                color = iconBackground,

            ) {

                Box(contentAlignment = Alignment.Center) {

                    Icon(

                        imageVector = icon,

                        contentDescription = null,

                        tint = iconTint,

                        modifier = Modifier.size(20.dp),

                    )

                }

            }

            Column(

                modifier = Modifier.weight(1f),

                verticalArrangement = Arrangement.spacedBy(2.dp),

            ) {

                Text(

                    text = label,

                    style = MaterialTheme.typography.labelMedium.copy(fontSize = 12.sp),

                    color = StockMateColors.Slate500,

                    maxLines = 1,

                    overflow = TextOverflow.Ellipsis,

                )

                Text(

                    text = value,

                    style = MaterialTheme.typography.titleMedium,

                    fontWeight = FontWeight.Bold,

                    color = StockMateColors.Slate900,

                    maxLines = 1,

                    overflow = TextOverflow.Ellipsis,

                )

                if (!trend.isNullOrBlank()) {

                    Text(

                        text = trend,

                        style = MaterialTheme.typography.labelSmall,

                        fontWeight = FontWeight.Medium,

                        color = StockMateColors.Brand600,

                        maxLines = 1,

                        overflow = TextOverflow.Ellipsis,

                    )

                }

            }

        }

    }



    if (onClick != null) {

        Surface(

            onClick = onClick,

            modifier = cardModifier,

            shape = RoundedCornerShape(12.dp),

            color = StockMateColors.Panel,

            border = BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),

            shadowElevation = 1.dp,

            content = { content() },

        )

    } else {

        Surface(

            modifier = cardModifier,

            shape = RoundedCornerShape(12.dp),

            color = StockMateColors.Panel,

            border = BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),

            shadowElevation = 1.dp,

            content = { content() },

        )

    }

}



@Composable

fun QuickActionTile(

    title: String,

    description: String,

    icon: ImageVector,

    iconBackground: Color,

    onClick: () -> Unit,

    modifier: Modifier = Modifier,

) {

    Surface(

        onClick = onClick,

        modifier = modifier

            .fillMaxWidth()

            .defaultMinSize(minHeight = 88.dp),

        shape = RoundedCornerShape(12.dp),

        color = StockMateColors.Panel,

        border = BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),

        shadowElevation = 1.dp,

    ) {

        Row(

            modifier = Modifier

                .fillMaxWidth()

                .padding(12.dp),

            horizontalArrangement = Arrangement.spacedBy(12.dp),

            verticalAlignment = Alignment.CenterVertically,

        ) {

            Surface(

                modifier = Modifier.size(40.dp),

                shape = RoundedCornerShape(12.dp),

                color = iconBackground,

            ) {

                Box(contentAlignment = Alignment.Center) {

                    Icon(

                        imageVector = icon,

                        contentDescription = null,

                        tint = Color.White,

                        modifier = Modifier.size(22.dp),

                    )

                }

            }

            Column(

                modifier = Modifier.weight(1f),

                verticalArrangement = Arrangement.spacedBy(2.dp),

            ) {

                Text(

                    text = title,

                    style = MaterialTheme.typography.bodyMedium,

                    fontWeight = FontWeight.SemiBold,

                    color = StockMateColors.Slate900,

                    maxLines = 2,

                    overflow = TextOverflow.Ellipsis,

                    lineHeight = 18.sp,

                )

                Text(

                    text = description,

                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),

                    color = StockMateColors.Slate500,

                    maxLines = 2,

                    overflow = TextOverflow.Ellipsis,

                    lineHeight = 14.sp,

                )

            }

        }

    }

}



@Composable

fun StockMatePrimaryButton(

    text: String,

    onClick: () -> Unit,

    modifier: Modifier = Modifier,

    enabled: Boolean = true,

    loading: Boolean = false,

) {

    Button(

        onClick = onClick,

        modifier = modifier

            .fillMaxWidth()

            .heightIn(min = 48.dp),

        enabled = enabled && !loading,

        shape = RoundedCornerShape(8.dp),

        colors = ButtonDefaults.buttonColors(

            containerColor = StockMateColors.Brand600,

            contentColor = Color.White,

            disabledContainerColor = StockMateColors.Brand600.copy(alpha = 0.5f),

        ),

        elevation = ButtonDefaults.buttonElevation(defaultElevation = 1.dp),

    ) {

        if (loading) {

            CircularProgressIndicator(

                modifier = Modifier.size(20.dp),

                strokeWidth = 2.dp,

                color = Color.White,

            )

        } else {

            Text(

                text = text,

                fontWeight = FontWeight.SemiBold,

                maxLines = 1,

                overflow = TextOverflow.Ellipsis,

            )

        }

    }

}



@Composable

fun StockMateSecondaryButton(

    text: String,

    onClick: () -> Unit,

    modifier: Modifier = Modifier,

    enabled: Boolean = true,

) {

    OutlinedButton(

        onClick = onClick,

        modifier = modifier

            .fillMaxWidth()

            .heightIn(min = 48.dp),

        enabled = enabled,

        shape = RoundedCornerShape(8.dp),

        border = BorderStroke(1.dp, StockMateColors.Border),

        colors = ButtonDefaults.outlinedButtonColors(

            containerColor = StockMateColors.Panel,

            contentColor = StockMateColors.Slate700,

        ),

    ) {

        Text(

            text = text,

            fontWeight = FontWeight.Medium,

            maxLines = 1,

            overflow = TextOverflow.Ellipsis,

        )

    }

}



@Composable

fun StockMateOutlinedFieldColors(): TextFieldColors {

    return OutlinedTextFieldDefaults.colors(

        focusedBorderColor = StockMateColors.Brand500,

        unfocusedBorderColor = StockMateColors.Border,

        focusedContainerColor = StockMateColors.Panel,

        unfocusedContainerColor = StockMateColors.Panel,

        cursorColor = StockMateColors.Brand600,

        focusedTextColor = StockMateColors.Slate900,

        unfocusedTextColor = StockMateColors.Slate900,

    )

}



@Composable

fun LoadingBox(modifier: Modifier = Modifier) {

    Box(

        modifier = modifier

            .fillMaxSize()

            .padding(16.dp),

        contentAlignment = Alignment.Center,

    ) {

        CircularProgressIndicator(color = StockMateColors.Brand600)

    }

}



@Composable

fun ErrorText(message: String?, modifier: Modifier = Modifier) {

    if (!message.isNullOrBlank()) {

        Text(

            text = message,

            color = StockMateColors.Red600,

            style = MaterialTheme.typography.bodyMedium,

            modifier = modifier.padding(vertical = 8.dp),

            textAlign = TextAlign.Center,

        )

    }

}



@Composable

fun SuccessText(message: String?, modifier: Modifier = Modifier) {

    if (!message.isNullOrBlank()) {

        Text(

            text = message,

            color = StockMateColors.Brand700,

            style = MaterialTheme.typography.bodyMedium,

            modifier = modifier.padding(vertical = 8.dp),

        )

    }

}



fun formatCurrency(amount: Double, currency: String = "PHP"): String {

    val symbol = when (currency.uppercase()) {

        "PHP" -> "₱"

        "USD" -> "$"

        else -> currency

    }

    val formatted = NumberFormat.getNumberInstance(Locale.US).format(amount)

    return "$symbol$formatted"

}



fun userInitials(name: String): String {

    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }

    return when {

        parts.isEmpty() -> "?"

        parts.size == 1 -> parts[0].take(2).uppercase()

        else -> "${parts.first().first()}${parts.last().first()}".uppercase()

    }

}



@Composable

fun EmptyState(message: String, modifier: Modifier = Modifier) {

    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {

        Text(

            text = message,

            style = MaterialTheme.typography.bodyLarge,

            textAlign = TextAlign.Center,

            color = StockMateColors.Slate500,

            modifier = Modifier.padding(horizontal = 24.dp),

        )

    }

}

