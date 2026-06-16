package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.ThreadMessage
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.*
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.viewmodel.ThreadViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val timeFormat = SimpleDateFormat("MMM d, h:mm a", Locale.US)

@Composable
fun MessageThreadScreen(
    user: User,
    contextType: String,
    contextId: String,
    title: String,
    branchId: String,
    viewModel: ThreadViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    val myUid = viewModel.myUid

    LaunchedEffect(contextId) {
        viewModel.start(user.storeId, contextType, contextId)
    }

    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    StockMateScaffold(
        topBar = {
            StockMateTopBar(title = title.ifBlank { "Conversation" }, onBack = onBack)
        },
        bottomBar = {
            StockMateBottomBar {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = uiState.input,
                        onValueChange = viewModel::updateInput,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("Write a message…") },
                        maxLines = 4,
                        colors = StockMateOutlinedFieldColors(),
                        shape = RoundedCornerShape(12.dp),
                    )
                    FilledIconButton(
                        onClick = { viewModel.send(contextType, contextId, title, branchId) },
                        enabled = uiState.input.isNotBlank() && !uiState.sending,
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = StockMateColors.Brand600,
                            contentColor = Color.White,
                        ),
                        modifier = Modifier.size(52.dp),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                    }
                }
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            ErrorText(uiState.error)
            if (uiState.messages.isEmpty()) {
                EmptyState("No messages yet. Start the conversation with your team.")
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.messages, key = { it.id }) { message ->
                        MessageBubble(message = message, mine = message.senderId == myUid)
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ThreadMessage, mine: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(0.82f),
            horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
        ) {
            Surface(
                color = if (mine) StockMateColors.Brand600 else StockMateColors.Slate100,
                shape = RoundedCornerShape(
                    topStart = 16.dp,
                    topEnd = 16.dp,
                    bottomStart = if (mine) 16.dp else 4.dp,
                    bottomEnd = if (mine) 4.dp else 16.dp,
                ),
            ) {
                Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    if (!mine) {
                        Text(
                            text = "${message.senderName} · ${roleLabel(message.senderRole)}",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = StockMateColors.Slate500,
                        )
                        Spacer(Modifier.height(2.dp))
                    }
                    Text(
                        text = message.text,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (mine) Color.White else StockMateColors.Slate800,
                    )
                }
            }
            Text(
                text = timeFormat.format(Date(message.createdAt)),
                style = MaterialTheme.typography.labelSmall,
                color = StockMateColors.Slate400,
                modifier = Modifier.padding(top = 2.dp, start = 4.dp, end = 4.dp),
            )
        }
    }
}

private fun roleLabel(role: String): String =
    role.replace('_', ' ').lowercase().replaceFirstChar { it.titlecase(Locale.US) }
