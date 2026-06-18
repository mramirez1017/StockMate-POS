package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.data.models.StockCount
import com.stockmate.pos.data.models.User
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class StockCountUiState(
    val counts: List<StockCount> = emptyList(),
    val products: List<Product> = emptyList(),
    val productsForBranchId: String? = null,
    val isLoading: Boolean = true,
    val loadingProducts: Boolean = false,
    val submitting: Boolean = false,
    val actingId: String? = null,
    val error: String? = null,
    val notice: String? = null,
)

class StockCountViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(StockCountUiState())
    val uiState: StateFlow<StockCountUiState> = _uiState.asStateFlow()

    private var observeJob: Job? = null
    private var storeId: String = ""

    fun start(user: User) {
        storeId = user.storeId
        if (observeJob == null) {
            observeJob = viewModelScope.launch {
                repository.observeStockCounts(user.storeId).collect { list ->
                    _uiState.update { it.copy(counts = list, isLoading = false) }
                }
            }
        }
    }

    /** Load the branch catalog (with on-hand stock) for the partial-count picker. */
    fun loadProductsFor(branchId: String) {
        if (branchId.isBlank()) return
        if (_uiState.value.productsForBranchId == branchId && _uiState.value.products.isNotEmpty()) return
        _uiState.update { it.copy(loadingProducts = true) }
        viewModelScope.launch {
            val list = runCatching { repository.searchProducts(storeId, branchId, "") }.getOrDefault(emptyList())
            _uiState.update { it.copy(products = list, productsForBranchId = branchId, loadingProducts = false) }
        }
    }

    fun create(branchId: String, scope: String, productIds: List<String>?, notes: String?) {
        if (_uiState.value.submitting) return
        _uiState.update { it.copy(submitting = true, error = null, notice = null) }
        viewModelScope.launch {
            repository.createStockCount(branchId, scope, productIds, notes)
                .onSuccess { _uiState.update { s -> s.copy(submitting = false, notice = "Count session started.") } }
                .onFailure { e -> _uiState.update { s -> s.copy(submitting = false, error = friendly(e)) } }
        }
    }

    fun submit(countId: String, counts: List<Pair<String, Int>>) = act(countId) {
        repository.submitStockCount(countId, counts)
    }

    fun cancel(countId: String, reason: String?) = act(countId) {
        repository.cancelStockCount(countId, reason)
    }

    private fun act(id: String, block: suspend () -> Result<Unit>) {
        if (_uiState.value.actingId != null) return
        _uiState.update { it.copy(actingId = id, error = null, notice = null) }
        viewModelScope.launch {
            block()
                .onSuccess { _uiState.update { s -> s.copy(actingId = null, notice = "Count updated.") } }
                .onFailure { e -> _uiState.update { s -> s.copy(actingId = null, error = friendly(e)) } }
        }
    }

    fun consumeMessages() {
        _uiState.update { it.copy(error = null, notice = null) }
    }

    private fun friendly(e: Throwable): String = e.message?.ifBlank { null } ?: "Something went wrong. Please try again."

    override fun onCleared() {
        observeJob?.cancel()
        super.onCleared()
    }
}
