package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.StoreNotification
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.*
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.viewmodel.NotificationsViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val notifTimeFormat = SimpleDateFormat("MMM d, h:mm a", Locale.US)

@Composable
fun NotificationsScreen(
    user: User,
    viewModel: NotificationsViewModel,
    onOpen: (StoreNotification) -> Unit,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(user.id) {
        viewModel.start(user.storeId, user.id)
    }

    StockMateScaffold(
        topBar = {
            StockMateTopBar(
                title = "Notifications",
                onBack = onBack,
                actions = {
                    if (uiState.unreadCount > 0) {
                        TextButton(onClick = viewModel::markAllRead) {
                            Text("Mark all read", color = StockMateColors.Brand600)
                        }
                    }
                },
            )
        },
    ) { padding ->
        if (uiState.notifications.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding)) {
                EmptyState("No notifications yet.")
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(uiState.notifications, key = { it.id }) { notification ->
                    NotificationRow(
                        notification = notification,
                        onClick = {
                            if (!notification.read) viewModel.markRead(notification.id)
                            onOpen(notification)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(notification: StoreNotification, onClick: () -> Unit) {
    val (icon, tint, background) = notificationVisual(notification.kind)
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = if (notification.read) StockMateColors.Panel else StockMateColors.Brand50,
        border = androidx.compose.foundation.BorderStroke(1.dp, StockMateColors.Border.copy(alpha = 0.8f)),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Surface(modifier = Modifier.size(36.dp), shape = CircleShape, color = background) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    notification.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = StockMateColors.Slate900,
                )
                Text(
                    notification.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = StockMateColors.Slate600,
                )
                Text(
                    notifTimeFormat.format(Date(notification.createdAt)),
                    style = MaterialTheme.typography.labelSmall,
                    color = StockMateColors.Slate400,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            if (!notification.read) {
                Box(
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .size(8.dp),
                ) {
                    Surface(color = StockMateColors.Brand600, shape = CircleShape) {
                        Box(Modifier.fillMaxSize()) {}
                    }
                }
            }
        }
    }
}

private fun notificationVisual(kind: String): Triple<ImageVector, Color, Color> = when (kind) {
    "NEW_MESSAGE" -> Triple(Icons.AutoMirrored.Filled.Message, StockMateColors.Brand600, StockMateColors.Brand100)
    "PO_CREATED" -> Triple(Icons.Default.LocalShipping, StockMateColors.Sky600, StockMateColors.Sky100)
    "DELIVERY_RECEIVED" -> Triple(Icons.Default.CheckCircle, StockMateColors.Brand600, StockMateColors.Brand100)
    "DELIVERY_DISCREPANCY" -> Triple(Icons.Default.Warning, StockMateColors.Amber600, StockMateColors.Amber100)
    "PO_COMPLETED" -> Triple(Icons.Default.TaskAlt, StockMateColors.Brand600, StockMateColors.Brand100)
    "PURCHASE_REQUEST_RESOLVED" -> Triple(Icons.Default.AssignmentTurnedIn, StockMateColors.Brand600, StockMateColors.Brand100)
    "PURCHASE_REQUEST", "STOCK_ADJUSTMENT_REQUEST", "SALE_VOID_REQUEST" ->
        Triple(Icons.Default.AssignmentTurnedIn, StockMateColors.Violet600, StockMateColors.Violet100)
    else -> Triple(Icons.Default.CheckCircle, StockMateColors.Brand600, StockMateColors.Brand100)
}
