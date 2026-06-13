package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import com.stockmate.pos.util.NumberInput
import kotlinx.coroutines.launch

data class DeliveryUiState(
    val purchaseOrders: List<PurchaseOrder> = emptyList(),
    val selectedPo: PurchaseOrder? = null,
    val receiveItems: List<ReceiveItemInput> = emptyList(),
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val successMessage: String? = null,
    val error: String? = null,
)

class DeliveryViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(DeliveryUiState())
    val uiState: StateFlow<DeliveryUiState> = _uiState.asStateFlow()

    fun loadPurchaseOrders(user: User) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                repository.getUpcomingPurchaseOrders(user.storeId, user.branchId)
            }.onSuccess { pos ->
                _uiState.update { it.copy(isLoading = false, purchaseOrders = pos) }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun selectPurchaseOrder(user: User, poId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                repository.getPurchaseOrder(user.storeId, poId)
            }.onSuccess { po ->
                val inputs = po?.items?.map { item ->
                    ReceiveItemInput(
                        productId = item.productId,
                        receivedQty = if (item.expectedQty > 0) item.expectedQty.toString() else "",
                    )
                } ?: emptyList()
                _uiState.update {
                    it.copy(isLoading = false, selectedPo = po, receiveItems = inputs)
                }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun updateReceiveItem(productId: String, block: (ReceiveItemInput) -> ReceiveItemInput) {
        _uiState.update { state ->
            state.copy(
                receiveItems = state.receiveItems.map { item ->
                    if (item.productId == productId) block(item) else item
                },
            )
        }
    }

    fun submitDelivery() {
        val po = _uiState.value.selectedPo ?: return
        val items = _uiState.value.receiveItems.filter { NumberInput.parseInteger(it.receivedQty) > 0 }
        if (items.isEmpty()) {
            _uiState.update { it.copy(error = "Enter received quantity for at least one item") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            runCatching {
                repository.receiveDelivery(po.id, items)
            }.onSuccess { result ->
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        selectedPo = null,
                        receiveItems = emptyList(),
                        successMessage = "Delivery received (${result.deliveryReceiptId})",
                    )
                }
            }.onFailure { e ->
                _uiState.update { it.copy(isSubmitting = false, error = e.message) }
            }
        }
    }

    fun clearSelection() {
        _uiState.update { it.copy(selectedPo = null, receiveItems = emptyList()) }
    }

    fun clearMessages() {
        _uiState.update { it.copy(error = null, successMessage = null) }
    }
}
