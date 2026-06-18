package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.stockmate.pos.data.models.BranchOption
import com.stockmate.pos.data.models.StockTransfer
import com.stockmate.pos.data.models.User
import com.stockmate.pos.data.models.UserRole
import com.stockmate.pos.ui.components.*
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.viewmodel.StockTransfersViewModel

@Composable
fun StockTransfersScreen(
    user: User,
    viewModel: StockTransfersViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val isAdmin = user.role == UserRole.ADMIN || user.role == UserRole.OWNER
    val canManage = isAdmin || user.role == UserRole.STORE_MANAGER
    val myUid = viewModel.currentUid ?: user.id

    LaunchedEffect(user.id) { viewModel.start(user) }

    LaunchedEffect(uiState.notice, uiState.error) {
        if (uiState.notice != null || uiState.error != null) {
            kotlinx.coroutines.delay(3500)
            viewModel.consumeMessages()
        }
    }

    val branchNames = remember(uiState.branches) { uiState.branches.associate { it.id to it.name } }
    fun branchName(id: String) = branchNames[id] ?: id

    // Only show transfers that involve this user's branch (admins see everything).
    val visible = uiState.transfers.filter {
        isAdmin || it.fromBranchId == user.branchId || it.toBranchId == user.branchId
    }

    var showCreate by remember { mutableStateOf(false) }

    StockMateScaffold(
        topBar = {
            StockMateAppTopBar(
                title = "Stock transfers",
                contextLabel = "Move stock between branches",
                onBack = onBack,
            )
        },
        floatingActionButton = {
            if (canManage && uiState.branches.size >= 2) {
                ExtendedFloatingActionButton(
                    onClick = { showCreate = true },
                    containerColor = StockMateColors.Brand600,
                    contentColor = androidx.compose.ui.graphics.Color.White,
                    icon = { Icon(Icons.Default.SwapHoriz, contentDescription = null) },
                    text = { Text("New transfer") },
                )
            }
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

                if (uiState.isLoading) {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center,
                    ) { CircularProgressIndicator(color = StockMateColors.Brand600) }
                } else if (visible.isEmpty()) {
                    StockMateCard {
                        Text(
                            text = "No transfers yet. Create one to move stock between your branches.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = StockMateColors.Slate500,
                        )
                    }
                } else {
                    visible.forEach { t ->
                        TransferCard(
                            transfer = t,
                            fromName = branchName(t.fromBranchId),
                            toName = branchName(t.toBranchId),
                            canApprove = t.status == "PENDING_APPROVAL" && isAdmin,
                            canReceive = t.status == "IN_TRANSIT" && canManage && (isAdmin || t.toBranchId == user.branchId),
                            canCancel = (t.status == "PENDING_APPROVAL" || t.status == "IN_TRANSIT") && canManage,
                            acting = uiState.actingId == t.id,
                            onApprove = { viewModel.approve(t.id) },
                            onReject = { viewModel.reject(t.id, null) },
                            onReceive = { viewModel.receive(t.id) },
                            onCancel = { viewModel.cancel(t.id, null) },
                        )
                    }
                }
            }
        }
    }

    if (showCreate) {
        CreateTransferDialog(
            user = user,
            isAdmin = isAdmin,
            branches = uiState.branches,
            products = uiState.products,
            loadingProducts = uiState.loadingProducts,
            submitting = uiState.submitting,
            onResolveSource = { viewModel.loadProductsFor(it) },
            onDismiss = { showCreate = false },
            onSubmit = { from, to, items, notes ->
                viewModel.submit(from, to, items, notes)
                showCreate = false
            },
        )
    }
}

@Composable
private fun TransferCard(
    transfer: StockTransfer,
    fromName: String,
    toName: String,
    canApprove: Boolean,
    canReceive: Boolean,
    canCancel: Boolean,
    acting: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onReceive: () -> Unit,
    onCancel: () -> Unit,
) {
    StockMateCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = transfer.transferNumber,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = StockMateColors.Slate900,
            )
            TransferStatusBadge(transfer.status)
        }
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(fromName, style = MaterialTheme.typography.bodyMedium, color = StockMateColors.Slate700, fontWeight = FontWeight.SemiBold)
            Icon(Icons.Default.ArrowForward, contentDescription = null, tint = StockMateColors.Sky600, modifier = Modifier.size(16.dp))
            Text(toName, style = MaterialTheme.typography.bodyMedium, color = StockMateColors.Slate700, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = "${transfer.items.size} item(s) · ${transfer.totalUnits} unit(s) · ${transfer.requestedByName}",
            style = MaterialTheme.typography.bodySmall,
            color = StockMateColors.Slate500,
        )
        if (!transfer.notes.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text("\u201C${transfer.notes}\u201D", style = MaterialTheme.typography.bodySmall, color = StockMateColors.Slate600)
        }

        transfer.items.forEach { item ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(item.productName, style = MaterialTheme.typography.bodySmall, color = StockMateColors.Slate700)
                Text(
                    text = if (transfer.status == "COMPLETED") "${item.receivedQty ?: item.quantity}" else "${item.quantity}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = StockMateColors.Slate900,
                )
            }
        }

        if (canApprove || canReceive || canCancel) {
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (canApprove) {
                    Box(Modifier.weight(1f)) {
                        StockMateSecondaryButton(text = "Reject", onClick = onReject, enabled = !acting)
                    }
                    Box(Modifier.weight(1f)) {
                        StockMatePrimaryButton(text = "Approve", onClick = onApprove, enabled = !acting, loading = acting)
                    }
                } else {
                    if (canCancel) {
                        Box(Modifier.weight(1f)) {
                            StockMateSecondaryButton(text = "Cancel", onClick = onCancel, enabled = !acting)
                        }
                    }
                    if (canReceive) {
                        Box(Modifier.weight(1f)) {
                            StockMatePrimaryButton(text = "Receive", onClick = onReceive, enabled = !acting, loading = acting)
                        }
                    }
                }
            }
        }

        val footer = buildList {
            transfer.approvedByName?.let { add("Approved / sent by $it") }
            transfer.receivedByName?.let { add("Received by $it") }
            transfer.rejectedByName?.let { add("Rejected by $it${transfer.rejectReason?.let { r -> " — $r" } ?: ""}") }
            transfer.cancelledByName?.let { add("Cancelled by $it${transfer.cancelReason?.let { r -> " — $r" } ?: ""}") }
        }
        if (footer.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            footer.forEach { line ->
                Text(line, style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate400)
            }
        }
    }
}

@Composable
private fun CreateTransferDialog(
    user: User,
    isAdmin: Boolean,
    branches: List<BranchOption>,
    products: List<com.stockmate.pos.data.models.Product>,
    loadingProducts: Boolean,
    submitting: Boolean,
    onResolveSource: (String) -> Unit,
    onDismiss: () -> Unit,
    onSubmit: (String, String, List<Pair<String, Int>>, String?) -> Unit,
) {
    var direction by remember { mutableStateOf("SEND") }
    var fromBranch by remember { mutableStateOf("") }
    var toBranch by remember { mutableStateOf("") }
    var otherBranch by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    val added = remember { mutableStateMapOf<String, Int>() }
    var localError by remember { mutableStateOf<String?>(null) }

    val resolvedFrom = if (isAdmin) fromBranch else if (direction == "SEND") user.branchId else otherBranch
    val resolvedTo = if (isAdmin) toBranch else if (direction == "SEND") otherBranch else user.branchId

    LaunchedEffect(resolvedFrom) {
        if (resolvedFrom.isNotBlank()) onResolveSource(resolvedFrom)
    }

    val productNames = remember(products) { products.associate { it.id to it.name } }
    val filtered = products.filter {
        query.isBlank() || it.name.contains(query, ignoreCase = true) || (it.sku?.contains(query, ignoreCase = true) == true)
    }.take(20)

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(16.dp), color = StockMateColors.Panel) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 560.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
            ) {
                Text("New stock transfer", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = StockMateColors.Slate900)
                Spacer(Modifier.height(12.dp))

                if (isAdmin) {
                    Text("From branch", style = MaterialTheme.typography.labelMedium, color = StockMateColors.Slate600)
                    branches.forEach { b ->
                        BranchSelectRow(label = b.name, selected = fromBranch == b.id) { fromBranch = b.id }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("To branch", style = MaterialTheme.typography.labelMedium, color = StockMateColors.Slate600)
                    branches.filter { it.id != fromBranch }.forEach { b ->
                        BranchSelectRow(label = b.name, selected = toBranch == b.id) { toBranch = b.id }
                    }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.weight(1f)) {
                            if (direction == "SEND") {
                                StockMatePrimaryButton(text = "Send to", onClick = { direction = "SEND" })
                            } else {
                                StockMateSecondaryButton(text = "Send to", onClick = { direction = "SEND" })
                            }
                        }
                        Box(Modifier.weight(1f)) {
                            if (direction == "REQUEST") {
                                StockMatePrimaryButton(text = "Request from", onClick = { direction = "REQUEST" })
                            } else {
                                StockMateSecondaryButton(text = "Request from", onClick = { direction = "REQUEST" })
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = if (direction == "SEND") "Destination branch" else "Source branch",
                        style = MaterialTheme.typography.labelMedium,
                        color = StockMateColors.Slate600,
                    )
                    branches.filter { it.id != user.branchId }.forEach { b ->
                        BranchSelectRow(label = b.name, selected = otherBranch == b.id) { otherBranch = b.id }
                    }
                }

                Spacer(Modifier.height(12.dp))
                Text("Items", style = MaterialTheme.typography.labelMedium, color = StockMateColors.Slate600)

                // Added items with quantity steppers.
                added.forEach { (productId, qty) ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = productNames[productId] ?: productId,
                            style = MaterialTheme.typography.bodySmall,
                            color = StockMateColors.Slate800,
                            modifier = Modifier.weight(1f),
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = {
                                val next = qty - 1
                                if (next <= 0) added.remove(productId) else added[productId] = next
                            }) { Icon(Icons.Default.Remove, contentDescription = "Less", tint = StockMateColors.Slate600) }
                            Text("$qty", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = StockMateColors.Slate900)
                            IconButton(onClick = { added[productId] = qty + 1 }) {
                                Icon(Icons.Default.Add, contentDescription = "More", tint = StockMateColors.Brand600)
                            }
                        }
                    }
                }

                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Search product to add") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = StockMateOutlinedFieldColors(),
                )
                if (loadingProducts) {
                    Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = StockMateColors.Brand600, modifier = Modifier.size(20.dp))
                    }
                } else if (query.isNotBlank()) {
                    filtered.filter { it.id !in added.keys }.forEach { p ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .selectable(selected = false, onClick = { added[p.id] = 1; query = "" })
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(p.name, style = MaterialTheme.typography.bodySmall, color = StockMateColors.Slate700, modifier = Modifier.weight(1f))
                            Text("On hand: ${p.currentStock}", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate400)
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = StockMateOutlinedFieldColors(),
                )

                localError?.let {
                    Spacer(Modifier.height(8.dp))
                    ErrorText(it)
                }

                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f)) {
                        StockMateSecondaryButton(text = "Cancel", onClick = onDismiss, enabled = !submitting)
                    }
                    Box(Modifier.weight(1f)) {
                        StockMatePrimaryButton(
                            text = "Create",
                            onClick = {
                                localError = when {
                                    resolvedFrom.isBlank() || resolvedTo.isBlank() -> "Choose both branches."
                                    resolvedFrom == resolvedTo -> "Branches must be different."
                                    added.isEmpty() -> "Add at least one item."
                                    else -> null
                                }
                                if (localError == null) {
                                    onSubmit(resolvedFrom, resolvedTo, added.map { it.key to it.value }, notes.ifBlank { null })
                                }
                            },
                            enabled = !submitting,
                            loading = submitting,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BranchSelectRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, onClick = onClick)
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RadioButton(
            selected = selected,
            onClick = onClick,
            colors = RadioButtonDefaults.colors(selectedColor = StockMateColors.Brand600),
        )
        Text(label, style = MaterialTheme.typography.bodyMedium, color = StockMateColors.Slate800)
    }
}

@Composable
private fun TransferStatusBadge(status: String) {
    val (bg, fg) = when (status) {
        "COMPLETED" -> StockMateColors.Brand100 to StockMateColors.Brand700
        "IN_TRANSIT" -> StockMateColors.Violet100 to StockMateColors.Violet600
        "CANCELLED", "REJECTED" -> StockMateColors.Rose100 to StockMateColors.Rose600
        else -> StockMateColors.Amber100 to StockMateColors.Amber600
    }
    val label = if (status == "PENDING_APPROVAL") "AWAITING APPROVAL" else status.replace("_", " ")
    Surface(shape = RoundedCornerShape(6.dp), color = bg) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = fg,
            fontSize = 10.sp,
        )
    }
}
