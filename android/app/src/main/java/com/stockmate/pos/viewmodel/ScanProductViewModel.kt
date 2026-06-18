package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.data.models.User
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ScanProductUiState(
    val query: String = "",
    val suggestions: List<Product> = emptyList(),
    val product: Product? = null,
    val isSearching: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
)

class ScanProductViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(ScanProductUiState())
    val uiState: StateFlow<ScanProductUiState> = _uiState.asStateFlow()
    private var searchJob: Job? = null

    /** Typing resets any opened detail so the suggestion list shows again. */
    fun setQuery(value: String) {
        _uiState.update { it.copy(query = value, product = null) }
    }

    /** Live, per-keystroke search (debounced) over name / SKU / barcode. */
    fun search(user: User) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(250)
            _uiState.update { it.copy(isSearching = true, error = null) }
            try {
                val results = repository.searchProducts(user.storeId, user.branchId, _uiState.value.query)
                _uiState.update { it.copy(isSearching = false, suggestions = results) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update { it.copy(isSearching = false, error = e.message) }
            }
        }
    }

    fun selectProduct(product: Product) {
        _uiState.update { it.copy(product = product) }
    }

    fun clearSelection() {
        _uiState.update { it.copy(product = null) }
    }

    /** Exact lookup from a scanned barcode; opens the product detail directly. */
    fun onBarcodeScanned(user: User, barcode: String) {
        val code = barcode.trim()
        if (code.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null, product = null) }
            runCatching {
                repository.findProductByBarcode(user.storeId, user.branchId, code)
            }.onSuccess { product ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        product = product,
                        error = if (product == null) "No product matches that barcode." else null,
                    )
                }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}
