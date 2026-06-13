package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.data.models.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AssignBarcodeUiState(
    val products: List<Product> = emptyList(),
    val selectedProduct: Product? = null,
    val searchQuery: String = "",
    val scannedBarcode: String = "",
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val successMessage: String? = null,
    val error: String? = null,
)

class AssignBarcodeViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(AssignBarcodeUiState())
    val uiState = _uiState.asStateFlow()

    fun setSearchQuery(value: String) {
        _uiState.update { it.copy(searchQuery = value) }
    }

    fun setScannedBarcode(value: String) {
        _uiState.update { it.copy(scannedBarcode = value, error = null) }
    }

    fun loadMissingBarcodeProducts(user: User) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                repository.listProductsMissingBarcode(
                    user.storeId,
                    user.branchId,
                    _uiState.value.searchQuery,
                )
            }.onSuccess { products ->
                _uiState.update { it.copy(products = products, isLoading = false) }
            }.onFailure { err ->
                _uiState.update {
                    it.copy(isLoading = false, error = err.message ?: "Failed to load products")
                }
            }
        }
    }

    fun selectProduct(product: Product) {
        _uiState.update {
            it.copy(
                selectedProduct = product,
                scannedBarcode = "",
                successMessage = null,
                error = null,
            )
        }
    }

    fun clearSelection() {
        _uiState.update {
            it.copy(
                selectedProduct = null,
                scannedBarcode = "",
                successMessage = null,
                error = null,
            )
        }
    }

    fun onBarcodeScanned(barcode: String) {
        _uiState.update { it.copy(scannedBarcode = barcode.trim(), error = null) }
    }

    fun saveBarcode(user: User, onSaved: () -> Unit) {
        val product = _uiState.value.selectedProduct ?: return
        val barcode = _uiState.value.scannedBarcode.trim()
        if (barcode.isEmpty()) {
            _uiState.update { it.copy(error = "Scan or enter a barcode first") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null, successMessage = null) }
            repository.updateProductBarcode(product.id, barcode)
                .onSuccess { saved ->
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            successMessage = "Barcode saved: $saved",
                            selectedProduct = null,
                            scannedBarcode = "",
                            products = it.products.filter { p -> p.id != product.id },
                        )
                    }
                    onSaved()
                }
                .onFailure { err ->
                    _uiState.update {
                        it.copy(isSaving = false, error = err.message ?: "Failed to save barcode")
                    }
                }
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(error = null, successMessage = null) }
    }
}
