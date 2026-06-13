package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.data.models.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ScanProductUiState(
    val barcodeInput: String = "",
    val product: Product? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
)

class ScanProductViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(ScanProductUiState())
    val uiState: StateFlow<ScanProductUiState> = _uiState.asStateFlow()

    fun setBarcodeInput(value: String) {
        _uiState.update { it.copy(barcodeInput = value) }
    }

    fun lookup(user: User) {
        val barcode = _uiState.value.barcodeInput.trim()
        if (barcode.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null, product = null) }
            runCatching {
                repository.findProductByBarcode(user.storeId, user.branchId, barcode)
            }.onSuccess { product ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        product = product,
                        error = if (product == null) "Product not found" else null,
                    )
                }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun clear() {
        _uiState.update { ScanProductUiState() }
    }
}
