package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.Sale
import com.stockmate.pos.data.models.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ReceiptUiState(
    val sale: Sale? = null,
    val recentSales: List<Sale> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val returnSubmitting: Boolean = false,
    val returnNotice: String? = null,
    val returnError: String? = null,
)

class ReceiptViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReceiptUiState())
    val uiState: StateFlow<ReceiptUiState> = _uiState.asStateFlow()

    fun setSale(sale: Sale) {
        _uiState.update { it.copy(sale = sale) }
    }

    fun loadRecentSales(user: User) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null, sale = null) }
            runCatching {
                repository.getRecentSales(user.storeId, user.branchId)
            }.onSuccess { sales ->
                _uiState.update { it.copy(isLoading = false, recentSales = sales) }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun loadSale(user: User, saleId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                repository.getSale(user.storeId, saleId)
            }.onSuccess { sale ->
                _uiState.update { it.copy(isLoading = false, sale = sale) }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    /** Process a (partial) return; items = (productId, quantity, restock). Reloads the sale on success. */
    fun processReturn(
        user: User,
        saleId: String,
        items: List<Triple<String, Int, Boolean>>,
        reason: String?,
        refundMethod: String?,
    ) {
        if (_uiState.value.returnSubmitting || items.isEmpty()) return
        _uiState.update { it.copy(returnSubmitting = true, returnError = null, returnNotice = null) }
        viewModelScope.launch {
            repository.createSaleReturn(saleId, items, reason, refundMethod)
                .onSuccess { refund ->
                    _uiState.update {
                        it.copy(returnSubmitting = false, returnNotice = "Refunded ₱%.2f".format(refund))
                    }
                    runCatching { repository.getSale(user.storeId, saleId) }
                        .onSuccess { sale -> _uiState.update { it.copy(sale = sale) } }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(returnSubmitting = false, returnError = e.message ?: "Return failed") }
                }
        }
    }

    fun consumeReturnMessages() {
        _uiState.update { it.copy(returnError = null, returnNotice = null) }
    }
}
