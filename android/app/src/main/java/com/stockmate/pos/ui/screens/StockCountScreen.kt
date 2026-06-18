package com.stockmate.pos.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ClearAll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.stockmate.pos.data.models.StockCount
import com.stockmate.pos.data.models.User
import com.stockmate.pos.data.models.UserRole
import com.stockmate.pos.ui.components.*
import com.stockmate.pos.ui.theme.StockMateColors
import com.stockmate.pos.util.NumberInput
import com.stockmate.pos.viewmodel.StockCountViewModel

@Composable
fun StockCountScreen(
    user: User,
    viewModel: StockCountViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val isAdmin = user.role == UserRole.ADMIN || user.role == UserRole.OWNER
    val canManage = isAdmin || user.role == UserRole.STORE_MANAGER

    LaunchedEffect(user.id) { viewModel.start(user) }

    LaunchedEffect(uiState.notice, uiState.error) {
        if (uiState.notice != null || uiState.error != null) {
            kotlinx.coroutines.delay(3500)
            viewModel.consumeMessages()
        }
    }

    // Admins see all branches; staff see only their branch.
    val visible = uiState.counts.filter { isAdmin || it.branchId == user.branchId }
    val activeForBranch = visible.firstOrNull {
        it.status == "IN_PROGRESS" && (isAdmin || it.branchId == user.branchId)
    }
    val history = visible.filter { it.id != activeForBranch?.id }

    var showCreate by remember { mutableStateOf(false) }

    StockMateScaffold(
        topBar = {
            StockMateAppTopBar(
                title = "Stock count",
                contextLabel = "Physical count & variance",
                onBack = onBack,
            )
        },
        floatingActionButton = {
            if (canManage && activeForBranch == null) {
                ExtendedFloatingActionButton(
                    onClick = { showCreate = true },
                    containerColor = StockMateColors.Brand600,
                    contentColor = androidx.compose.ui.graphics.Color.White,
                    icon = { Icon(Icons.Default.ClearAll, contentDescription = null) },
                    text = { Text("Start count") },
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
                } else {
                    if (activeForBranch != null) {
                        ActiveCountCard(
                            count = activeForBranch,
                            canManage = canManage,
                            acting = uiState.actingId == activeForBranch.id,
                            onPost = { counts -> viewModel.submit(activeForBranch.id, counts) },
                            onCancel = { viewModel.cancel(activeForBranch.id, null) },
                        )
                        Spacer(Modifier.height(12.dp))
                    }

                    SectionHeading(text = "Recent counts")
                    if (history.isEmpty()) {
                        StockMateCard {
                            Text(
                                text = "No stock counts yet. Start one to reconcile physical inventory.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = StockMateColors.Slate500,
                            )
                        }
                    } else {
                        history.forEach { c -> CountHistoryCard(c) }
                    }
                }
            }
        }
    }

    if (showCreate) {
        StartCountDialog(
            products = uiState.products,
            loadingProducts = uiState.loadingProducts,
            submitting = uiState.submitting,
            onResolveBranch = { viewModel.loadProductsFor(user.branchId) },
            onDismiss = { showCreate = false },
            onSubmit = { scope, productIds, notes ->
                viewModel.create(user.branchId, scope, productIds, notes)
                showCreate = false
            },
        )
    }
}

@Composable
private fun ActiveCountCard(
    count: StockCount,
    canManage: Boolean,
    acting: Boolean,
    onPost: (List<Pair<String, Int>>) -> Unit,
    onCancel: () -> Unit,
) {
    val entries = remember(count.id) { mutableStateMapOf<String, String>() }

    StockMateCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Counting · ${count.countNumber}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = StockMateColors.Slate900,
                )
                Text(
                    text = "${count.items.size} item(s) · ${count.scope.lowercase()} count · by ${count.startedByName}",
                    style = MaterialTheme.typography.bodySmall,
                    color = StockMateColors.Slate500,
                )
            }
            CountStatusBadge(count.status)
        }

        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Product", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate500, modifier = Modifier.weight(1f))
            Text("Exp.", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate500, modifier = Modifier.width(40.dp), textAlign = TextAlign.Center)
            Text("Counted", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate500, modifier = Modifier.width(76.dp), textAlign = TextAlign.Center)
            Text("Var.", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate500, modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
        }
        HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))

        count.items.forEach { item ->
            val raw = entries[item.productId].orEmpty()
            val counted = if (raw.isBlank()) null else NumberInput.parseInteger(raw)
            val variance = counted?.let { it - item.expectedQty }
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = item.productName,
                    style = MaterialTheme.typography.bodySmall,
                    color = StockMateColors.Slate800,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "${item.expectedQty}",
                    style = MaterialTheme.typography.bodySmall,
                    color = StockMateColors.Slate500,
                    modifier = Modifier.width(40.dp),
                    textAlign = TextAlign.Center,
                )
                OutlinedTextField(
                    value = raw,
                    onValueChange = { entries[item.productId] = NumberInput.sanitizeIntegerInput(it) },
                    placeholder = { Text("—", textAlign = TextAlign.Center) },
                    modifier = Modifier.width(76.dp),
                    singleLine = true,
                    enabled = canManage && !acting,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(textAlign = TextAlign.Center),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = StockMateOutlinedFieldColors(),
                )
                Text(
                    text = variance?.let { if (it > 0) "+$it" else "$it" } ?: "—",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = when {
                        variance == null || variance == 0 -> StockMateColors.Slate400
                        variance > 0 -> StockMateColors.Brand700
                        else -> StockMateColors.Rose600
                    },
                    modifier = Modifier.width(44.dp),
                    textAlign = TextAlign.End,
                )
            }
        }

        if (canManage) {
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) {
                    StockMateSecondaryButton(text = "Cancel", onClick = onCancel, enabled = !acting)
                }
                Box(Modifier.weight(1f)) {
                    StockMatePrimaryButton(
                        text = "Post count",
                        onClick = {
                            val counts = entries.entries
                                .mapNotNull { (pid, v) ->
                                    if (v.isBlank()) null
                                    else NumberInput.parseInteger(v).takeIf { it >= 0 }?.let { pid to it }
                                }
                            onPost(counts)
                        },
                        enabled = !acting && entries.values.any { it.isNotBlank() },
                        loading = acting,
                    )
                }
            }
        }
    }
}

@Composable
private fun CountHistoryCard(count: StockCount) {
    StockMateCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = count.countNumber,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = StockMateColors.Slate900,
            )
            CountStatusBadge(count.status)
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = "${count.items.size} item(s) · ${count.scope.lowercase()} count · by ${count.startedByName}",
            style = MaterialTheme.typography.bodySmall,
            color = StockMateColors.Slate500,
        )
        if (count.status == "COMPLETED") {
            Spacer(Modifier.height(4.dp))
            Text(
                text = "${count.varianceItems ?: 0} item(s) adjusted · ${count.totalVarianceUnits ?: 0} unit variance" +
                    (count.completedByName?.let { " · by $it" } ?: ""),
                style = MaterialTheme.typography.bodySmall,
                color = StockMateColors.Slate600,
            )
        }
        if (count.status == "CANCELLED" && !count.cancelledByName.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Cancelled by ${count.cancelledByName}" + (count.cancelReason?.let { " — $it" } ?: ""),
                style = MaterialTheme.typography.labelSmall,
                color = StockMateColors.Slate400,
            )
        }
    }
}

@Composable
private fun StartCountDialog(
    products: List<com.stockmate.pos.data.models.Product>,
    loadingProducts: Boolean,
    submitting: Boolean,
    onResolveBranch: () -> Unit,
    onDismiss: () -> Unit,
    onSubmit: (String, List<String>?, String?) -> Unit,
) {
    var scope by remember { mutableStateOf("FULL") }
    var query by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    val selected = remember { mutableStateMapOf<String, Boolean>() }
    var localError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(scope) {
        if (scope == "PARTIAL") onResolveBranch()
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
                Text("Start stock count", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = StockMateColors.Slate900)
                Spacer(Modifier.height(12.dp))

                Text("Scope", style = MaterialTheme.typography.labelMedium, color = StockMateColors.Slate600)
                ScopeRow(label = "Full count (all active products)", selected = scope == "FULL") { scope = "FULL" }
                ScopeRow(label = "Partial count (choose products)", selected = scope == "PARTIAL") { scope = "PARTIAL" }

                if (scope == "PARTIAL") {
                    Spacer(Modifier.height(12.dp))
                    val selectedCount = selected.count { it.value }
                    Text("Products ($selectedCount selected)", style = MaterialTheme.typography.labelMedium, color = StockMateColors.Slate600)

                    selected.filter { it.value }.keys.toList().forEach { pid ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(productNames[pid] ?: pid, style = MaterialTheme.typography.bodySmall, color = StockMateColors.Slate800, modifier = Modifier.weight(1f))
                            TextButton(onClick = { selected[pid] = false }) {
                                Text("Remove", color = StockMateColors.Rose600, style = MaterialTheme.typography.labelMedium)
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
                        filtered.filter { selected[it.id] != true }.forEach { p ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .selectable(selected = false, onClick = { selected[p.id] = true; query = "" })
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(p.name, style = MaterialTheme.typography.bodySmall, color = StockMateColors.Slate700, modifier = Modifier.weight(1f))
                                Text("On hand: ${p.currentStock}", style = MaterialTheme.typography.labelSmall, color = StockMateColors.Slate400)
                            }
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
                            text = "Start",
                            onClick = {
                                val ids = selected.filter { it.value }.keys.toList()
                                localError = if (scope == "PARTIAL" && ids.isEmpty()) {
                                    "Select at least one product."
                                } else {
                                    null
                                }
                                if (localError == null) {
                                    onSubmit(
                                        scope,
                                        if (scope == "PARTIAL") ids else null,
                                        notes.ifBlank { null },
                                    )
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
private fun ScopeRow(label: String, selected: Boolean, onClick: () -> Unit) {
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
private fun CountStatusBadge(status: String) {
    val (bg, fg) = when (status) {
        "COMPLETED" -> StockMateColors.Brand100 to StockMateColors.Brand700
        "CANCELLED" -> StockMateColors.Rose100 to StockMateColors.Rose600
        else -> StockMateColors.Amber100 to StockMateColors.Amber600
    }
    Surface(shape = RoundedCornerShape(6.dp), color = bg) {
        Text(
            text = status.replace("_", " "),
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = fg,
            fontSize = 10.sp,
        )
    }
}
