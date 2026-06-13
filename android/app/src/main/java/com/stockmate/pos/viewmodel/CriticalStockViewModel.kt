package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.CriticalStock
import com.stockmate.pos.data.models.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CriticalStockUiState(
    val items: List<CriticalStock> = emptyList(),
    val isLoading: Boolean = false,
    val requestingProductId: String? = null,
    val successMessage: String? = null,
    val error: String? = null,
)

class CriticalStockViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(CriticalStockUiState())
    val uiState: StateFlow<CriticalStockUiState> = _uiState.asStateFlow()

    fun load(user: User) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                repository.getCriticalStocks(user.storeId, user.branchId)
            }.onSuccess { items ->
                _uiState.update { it.copy(isLoading = false, items = items) }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun createPurchaseRequest(user: User, item: CriticalStock) {
        if (!user.canCreatePurchaseRequest) {
            _uiState.update { it.copy(error = "Not authorized to create purchase requests") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(requestingProductId = item.productId, error = null) }
            runCatching {
                repository.createPurchaseRequest(
                    productId = item.productId,
                    suggestedQty = item.suggestedOrderQty.coerceAtLeast(1),
                )
            }.onSuccess {
                _uiState.update {
                    it.copy(
                        requestingProductId = null,
                        successMessage = "Purchase request created for ${item.productName}",
                    )
                }
            }.onFailure { e ->
                _uiState.update { it.copy(requestingProductId = null, error = e.message) }
            }
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(error = null, successMessage = null) }
    }
}
