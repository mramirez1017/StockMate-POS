package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.stockmate.pos.data.models.PermissionRequest
import com.stockmate.pos.data.models.RequestablePermission
import com.stockmate.pos.data.models.User
import com.stockmate.pos.data.models.UserRole
import com.stockmate.pos.ui.components.*
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.viewmodel.AccessRequestsViewModel

@Composable
fun AccessRequestsScreen(
    user: User,
    viewModel: AccessRequestsViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val isAdmin = user.role == UserRole.ADMIN || user.role == UserRole.OWNER
    val myUid = viewModel.currentUid ?: user.id

    LaunchedEffect(user.storeId) { viewModel.start(user.storeId) }

    LaunchedEffect(uiState.notice, uiState.error) {
        if (uiState.notice != null || uiState.error != null) {
            kotlinx.coroutines.delay(3500)
            viewModel.consumeMessages()
        }
    }

    val heldKeys = remember(user.permissions) {
        buildSet {
            user.permissions?.let { p ->
                if (p.canApproveStockAdjustment) add("canApproveStockAdjustment")
                if (p.canViewSupplierCost) add("canViewSupplierCost")
                if (p.canCreatePurchaseRequest) add("canCreatePurchaseRequest")
                if (p.canChangePrice) add("canChangePrice")
            }
        }
    }

    val myRequests = uiState.requests.filter { it.requestedBy == myUid }
    val pendingKeys = myRequests.filter { it.status == "PENDING" }.map { it.permission }.toSet()
    val pendingForAdmin = uiState.requests.filter { it.status == "PENDING" }

    var selected by remember { mutableStateOf<RequestablePermission?>(null) }
    var reason by remember { mutableStateOf("") }

    StockMateScaffold(
        topBar = {
            StockMateAppTopBar(
                title = "Access requests",
                contextLabel = if (isAdmin) "Review staff access" else "Request elevated access",
                onBack = onBack,
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(bottom = 24.dp),
        ) {
            StockMateScreenPadding {
                if (uiState.error != null) ErrorText(uiState.error)
                if (uiState.notice != null) SuccessText(uiState.notice)

                if (isAdmin) {
                    SectionHeading(text = "Pending approvals (${pendingForAdmin.size})")
                    if (pendingForAdmin.isEmpty()) {
                        StockMateCard {
                            Text(
                                text = "No access requests waiting for review.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = StockMateColors.Slate500,
                            )
                        }
                    } else {
                        pendingForAdmin.forEach { req ->
                            AdminRequestCard(
                                request = req,
                                acting = uiState.actingId == req.id,
                                onApprove = { viewModel.approve(req.id) },
                                onReject = { viewModel.reject(req.id) },
                            )
                        }
                    }

                    SectionHeading(text = "History", modifier = Modifier.padding(top = 4.dp))
                    val history = uiState.requests.filter { it.status != "PENDING" }
                    if (history.isEmpty()) {
                        Text(
                            text = "Resolved requests will appear here.",
                            style = MaterialTheme.typography.bodySmall,
                            color = StockMateColors.Slate500,
                        )
                    } else {
                        history.forEach { req -> HistoryRow(req, showName = true) }
                    }
                } else {
                    val requestable = RequestablePermission.entries.filter { it.key !in heldKeys }

                    SectionHeading(text = "Request access")
                    StockMateCard {
                        if (requestable.isEmpty()) {
                            Text(
                                text = "You already have all requestable permissions.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = StockMateColors.Slate500,
                            )
                        } else {
                            Text(
                                text = "Choose a permission to request. An admin will review it.",
                                style = MaterialTheme.typography.bodySmall,
                                color = StockMateColors.Slate500,
                            )
                            Spacer(Modifier.height(8.dp))
                            requestable.forEach { perm ->
                                val alreadyPending = perm.key in pendingKeys
                                PermissionOptionRow(
                                    perm = perm,
                                    selected = selected == perm,
                                    enabled = !alreadyPending,
                                    pending = alreadyPending,
                                    onSelect = { selected = perm },
                                )
                            }
                            Spacer(Modifier.height(12.dp))
                            OutlinedTextField(
                                value = reason,
                                onValueChange = { reason = it },
                                label = { Text("Reason (optional)") },
                                modifier = Modifier.fillMaxWidth(),
                                minLines = 2,
                                colors = StockMateOutlinedFieldColors(),
                            )
                            Spacer(Modifier.height(12.dp))
                            StockMatePrimaryButton(
                                text = "Send request",
                                onClick = {
                                    selected?.let { viewModel.submitRequest(it.key, reason) }
                                    selected = null
                                    reason = ""
                                },
                                enabled = selected != null && !uiState.submitting,
                                loading = uiState.submitting,
                            )
                        }
                    }

                    SectionHeading(text = "My requests", modifier = Modifier.padding(top = 4.dp))
                    if (myRequests.isEmpty()) {
                        Text(
                            text = "You haven't requested any access yet.",
                            style = MaterialTheme.typography.bodySmall,
                            color = StockMateColors.Slate500,
                        )
                    } else {
                        myRequests.forEach { req -> HistoryRow(req, showName = false) }
                    }
                }
            }
        }
    }
}

@Composable
private fun PermissionOptionRow(
    perm: RequestablePermission,
    selected: Boolean,
    enabled: Boolean,
    pending: Boolean,
    onSelect: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, enabled = enabled, onClick = onSelect)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RadioButton(
            selected = selected,
            onClick = onSelect,
            enabled = enabled,
            colors = RadioButtonDefaults.colors(selectedColor = StockMateColors.Brand600),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = perm.label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = StockMateColors.Slate900,
            )
            Text(
                text = perm.description,
                style = MaterialTheme.typography.bodySmall,
                color = StockMateColors.Slate500,
            )
        }
        if (pending) StatusBadge("PENDING")
    }
}

@Composable
private fun AdminRequestCard(
    request: PermissionRequest,
    acting: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
) {
    StockMateCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = request.permissionLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = StockMateColors.Slate900,
                )
                Text(
                    text = "Requested by ${request.requestedByName}",
                    style = MaterialTheme.typography.bodySmall,
                    color = StockMateColors.Slate500,
                )
            }
            StatusBadge(request.status)
        }
        if (!request.reason.isNullOrBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = "\u201C${request.reason}\u201D",
                style = MaterialTheme.typography.bodySmall,
                color = StockMateColors.Slate600,
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(modifier = Modifier.weight(1f)) {
                StockMateSecondaryButton(text = "Reject", onClick = onReject, enabled = !acting)
            }
            Box(modifier = Modifier.weight(1f)) {
                StockMatePrimaryButton(text = "Approve", onClick = onApprove, enabled = !acting, loading = acting)
            }
        }
    }
}

@Composable
private fun HistoryRow(req: PermissionRequest, showName: Boolean) {
    StockMateCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = req.permissionLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = StockMateColors.Slate900,
                )
                if (showName) {
                    Text(
                        text = req.requestedByName,
                        style = MaterialTheme.typography.bodySmall,
                        color = StockMateColors.Slate500,
                    )
                }
            }
            StatusBadge(req.status)
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    val (bg, fg) = when (status) {
        "APPROVED" -> StockMateColors.Brand100 to StockMateColors.Brand700
        "REJECTED" -> StockMateColors.Rose100 to StockMateColors.Rose600
        else -> StockMateColors.Amber100 to StockMateColors.Amber600
    }
    Surface(shape = RoundedCornerShape(6.dp), color = bg) {
        Text(
            text = status,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = fg,
            fontSize = 10.sp,
        )
    }
}
