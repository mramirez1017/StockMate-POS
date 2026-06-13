package com.stockmate.pos.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.stockmate.pos.data.models.DisposalReason
import com.stockmate.pos.data.models.User
import com.stockmate.pos.ui.components.ErrorText
import com.stockmate.pos.ui.components.StockMateTopBar
import com.stockmate.pos.ui.components.SuccessText
import com.stockmate.pos.viewmodel.DisposalViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockDisposalScreen(
    user: User,
    viewModel: DisposalViewModel,
    onBack: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    var reasonExpanded by remember { mutableStateOf(false) }

    Scaffold(
        topBar = { StockMateTopBar(title = "Stock Disposal", onBack = onBack) },
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Button(
                    onClick = { viewModel.submit(user) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    enabled = !uiState.isSubmitting,
                ) {
                    if (uiState.isSubmitting) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Submit Disposal")
                    }
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SuccessText(uiState.successMessage)
            ErrorText(uiState.error)
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = viewModel::setSearchQuery,
                label = { Text("Search product") },
                modifier = Modifier.fillMaxWidth(),
                trailingIcon = {
                    TextButton(onClick = { viewModel.search(user) }) { Text("Search") }
                },
                singleLine = true,
            )
            if (uiState.searchResults.isNotEmpty()) {
                LazyColumn(
                    modifier = Modifier.heightIn(max = 200.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    items(uiState.searchResults, key = { it.id }) { product ->
                        ListItem(
                            headlineContent = { Text(product.name) },
                            supportingContent = { Text("Stock: ${product.currentStock}") },
                            modifier = Modifier.clickable { viewModel.selectProduct(product) },
                        )
                        HorizontalDivider()
                    }
                }
            }
            uiState.selectedProduct?.let { product ->
                Text("Selected: ${product.name} (stock: ${product.currentStock})")
            }
            OutlinedTextField(
                value = uiState.quantity,
                onValueChange = viewModel::setQuantity,
                label = { Text("Quantity") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            ExposedDropdownMenuBox(
                expanded = reasonExpanded,
                onExpandedChange = { reasonExpanded = it },
            ) {
                OutlinedTextField(
                    value = uiState.reason.label,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Reason") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = reasonExpanded) },
                )
                ExposedDropdownMenu(
                    expanded = reasonExpanded,
                    onDismissRequest = { reasonExpanded = false },
                ) {
                    DisposalReason.entries.forEach { reason ->
                        DropdownMenuItem(
                            text = { Text(reason.label) },
                            onClick = {
                                viewModel.setReason(reason)
                                reasonExpanded = false
                            },
                        )
                    }
                }
            }
            OutlinedTextField(
                value = uiState.remarks,
                onValueChange = viewModel::setRemarks,
                label = { Text("Remarks (optional)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
        }
    }
}
