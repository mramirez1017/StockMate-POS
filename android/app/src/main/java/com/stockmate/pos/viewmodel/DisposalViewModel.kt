package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.DisposalReason
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.data.models.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import com.stockmate.pos.util.NumberInput
import kotlinx.coroutines.launch

data class DisposalUiState(
    val searchQuery: String = "",
    val searchResults: List<Product> = emptyList(),
    val selectedProduct: Product? = null,
    val quantity: String = "",
    val reason: DisposalReason = DisposalReason.EXPIRED,
    val remarks: String = "",
    val isSearching: Boolean = false,
    val isSubmitting: Boolean = false,
    val successMessage: String? = null,
    val error: String? = null,
)

class DisposalViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(DisposalUiState())
    val uiState: StateFlow<DisposalUiState> = _uiState.asStateFlow()

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun search(user: User) {
        val query = _uiState.value.searchQuery
        viewModelScope.launch {
            _uiState.update { it.copy(isSearching = true, error = null) }
            runCatching {
                repository.searchProducts(user.storeId, user.branchId, query)
            }.onSuccess { products ->
                _uiState.update { it.copy(isSearching = false, searchResults = products.take(30)) }
            }.onFailure { e ->
                _uiState.update { it.copy(isSearching = false, error = e.message) }
            }
        }
    }

    fun selectProduct(product: Product) {
        _uiState.update {
            it.copy(selectedProduct = product, searchResults = emptyList(), searchQuery = product.name)
        }
    }

    fun setQuantity(value: String) {
        _uiState.update { it.copy(quantity = NumberInput.sanitizeIntegerInput(value)) }
    }

    fun setReason(reason: DisposalReason) {
        _uiState.update { it.copy(reason = reason) }
    }

    fun setRemarks(value: String) {
        _uiState.update { it.copy(remarks = value) }
    }

    fun submit(user: User) {
        val product = _uiState.value.selectedProduct
        val qty = NumberInput.parseInteger(_uiState.value.quantity)
        if (product == null) {
            _uiState.update { it.copy(error = "Select a product") }
            return
        }
        if (_uiState.value.quantity.isBlank() || qty <= 0) {
            _uiState.update { it.copy(error = "Enter a valid quantity") }
            return
        }
        if (qty > product.currentStock) {
            _uiState.update { it.copy(error = "Quantity exceeds stock (${product.currentStock})") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            runCatching {
                repository.createDisposal(
                    branchId = user.branchId,
                    productId = product.id,
                    quantity = qty,
                    reason = _uiState.value.reason,
                    remarks = _uiState.value.remarks.ifBlank { null },
                )
            }.onSuccess {
                _uiState.update {
                    DisposalUiState(successMessage = "Disposal recorded successfully")
                }
            }.onFailure { e ->
                _uiState.update { it.copy(isSubmitting = false, error = e.message) }
            }
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(error = null, successMessage = null) }
    }
}
