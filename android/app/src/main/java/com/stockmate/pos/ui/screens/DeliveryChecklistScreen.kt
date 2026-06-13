package com.stockmate.pos.ui.screens



import androidx.compose.foundation.layout.*

import androidx.compose.foundation.lazy.LazyColumn

import androidx.compose.foundation.lazy.items

import androidx.compose.foundation.text.KeyboardOptions

import androidx.compose.material3.*

import androidx.compose.runtime.*

import androidx.compose.ui.Modifier

import androidx.compose.ui.text.input.KeyboardType

import androidx.compose.ui.unit.dp

import com.stockmate.pos.data.models.User

import com.stockmate.pos.ui.components.ErrorText

import com.stockmate.pos.ui.components.LoadingBox

import com.stockmate.pos.ui.components.StockMateTopBar

import com.stockmate.pos.ui.components.SuccessText

import com.stockmate.pos.util.NumberInput

import com.stockmate.pos.viewmodel.DeliveryViewModel



@Composable

fun DeliveryChecklistScreen(

    user: User,

    poId: String,

    viewModel: DeliveryViewModel,

    onSubmitted: () -> Unit,

    onBack: () -> Unit,

) {

    val uiState by viewModel.uiState.collectAsState()



    LaunchedEffect(poId) {

        if (uiState.selectedPo?.id != poId) {

            viewModel.selectPurchaseOrder(user, poId)

        }

    }



    LaunchedEffect(uiState.successMessage) {

        if (uiState.successMessage != null) {

            onSubmitted()

        }

    }



    val po = uiState.selectedPo



    Scaffold(

        topBar = {

            StockMateTopBar(

                title = po?.poNumber ?: "Delivery Checklist",

                onBack = onBack,

            )

        },

        bottomBar = {

            if (po != null) {

                Surface(tonalElevation = 3.dp) {

                    Button(

                        onClick = viewModel::submitDelivery,

                        modifier = Modifier

                            .fillMaxWidth()

                            .padding(16.dp),

                        enabled = !uiState.isSubmitting,

                    ) {

                        if (uiState.isSubmitting) {

                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)

                        } else {

                            Text("Submit Delivery")

                        }

                    }

                }

            }

        },

    ) { padding ->

        when {

            uiState.isLoading && po == null -> LoadingBox(Modifier.padding(padding))

            po == null -> ErrorText("Purchase order not found", Modifier.padding(padding).padding(16.dp))

            else -> LazyColumn(

                modifier = Modifier

                    .fillMaxSize()

                    .padding(padding)

                    .padding(horizontal = 16.dp),

                verticalArrangement = Arrangement.spacedBy(12.dp),

                contentPadding = PaddingValues(vertical = 16.dp),

            ) {

                item {

                    SuccessText(uiState.successMessage)

                    ErrorText(uiState.error)

                    Text("Check received and damaged quantities per line item.")

                }

                items(uiState.receiveItems, key = { it.productId }) { input ->

                    val poItem = po.items.find { it.productId == input.productId }

                    ElevatedCard(modifier = Modifier.fillMaxWidth()) {

                        Column(modifier = Modifier.padding(12.dp)) {

                            Text(

                                poItem?.productName ?: input.productId,

                                style = MaterialTheme.typography.titleMedium,

                            )

                            Text("Expected: ${poItem?.expectedQty ?: 0}")

                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {

                                OutlinedTextField(

                                    value = input.receivedQty,

                                    onValueChange = { v ->

                                        val sanitized = NumberInput.sanitizeIntegerInput(v)

                                        viewModel.updateReceiveItem(input.productId) { it.copy(receivedQty = sanitized) }

                                    },

                                    label = { Text("Received") },

                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),

                                    modifier = Modifier.weight(1f),

                                    singleLine = true,

                                )

                                OutlinedTextField(

                                    value = input.damagedQty,

                                    onValueChange = { v ->

                                        val sanitized = NumberInput.sanitizeIntegerInput(v)

                                        viewModel.updateReceiveItem(input.productId) { it.copy(damagedQty = sanitized) }

                                    },

                                    label = { Text("Damaged") },

                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),

                                    modifier = Modifier.weight(1f),

                                    singleLine = true,

                                )

                            }

                            OutlinedTextField(

                                value = input.remarks,

                                onValueChange = { v ->

                                    viewModel.updateReceiveItem(input.productId) { it.copy(remarks = v) }

                                },

                                label = { Text("Remarks") },

                                modifier = Modifier.fillMaxWidth(),

                                singleLine = true,

                            )

                        }

                    }

                }

            }

        }

    }

}


