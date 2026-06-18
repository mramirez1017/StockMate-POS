package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.BranchOption
import com.stockmate.pos.data.models.Product
import com.stockmate.pos.data.models.StockTransfer
import com.stockmate.pos.data.models.User
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class StockTransfersUiState(
    val transfers: List<StockTransfer> = emptyList(),
    val branches: List<BranchOption> = emptyList(),
    val products: List<Product> = emptyList(),
    val productsForBranchId: String? = null,
    val isLoading: Boolean = true,
    val loadingProducts: Boolean = false,
    val submitting: Boolean = false,
    val actingId: String? = null,
    val error: String? = null,
    val notice: String? = null,
)

class StockTransfersViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(StockTransfersUiState())
    val uiState: StateFlow<StockTransfersUiState> = _uiState.asStateFlow()

    val currentUid: String? get() = repository.currentUid

    private var observeJob: Job? = null
    private var storeId: String = ""

    fun start(user: User) {
        storeId = user.storeId
        if (observeJob == null) {
            observeJob = viewModelScope.launch {
                repository.observeStockTransfers(user.storeId).collect { list ->
                    _uiState.update { it.copy(transfers = list, isLoading = false) }
                }
            }
            viewModelScope.launch {
                runCatching { repository.loadBranchOptions(user.storeId) }
                    .onSuccess { branches -> _uiState.update { it.copy(branches = branches) } }
            }
        }
    }

    /** Load the catalog (with source-branch stock) for the create picker. */
    fun loadProductsFor(branchId: String) {
        if (branchId.isBlank()) return
        if (_uiState.value.productsForBranchId == branchId && _uiState.value.products.isNotEmpty()) return
        _uiState.update { it.copy(loadingProducts = true) }
        viewModelScope.launch {
            val list = runCatching { repository.searchProducts(storeId, branchId, "") }.getOrDefault(emptyList())
            _uiState.update { it.copy(products = list, productsForBranchId = branchId, loadingProducts = false) }
        }
    }

    fun submit(
        fromBranchId: String,
        toBranchId: String,
        items: List<Pair<String, Int>>,
        notes: String?,
    ) {
        if (_uiState.value.submitting) return
        _uiState.update { it.copy(submitting = true, error = null, notice = null) }
        viewModelScope.launch {
            repository.createStockTransfer(fromBranchId, toBranchId, items, notes)
                .onSuccess { _uiState.update { s -> s.copy(submitting = false, notice = "Transfer created.") } }
                .onFailure { e -> _uiState.update { s -> s.copy(submitting = false, error = friendly(e)) } }
        }
    }

    fun approve(id: String) = act(id) { repository.approveStockTransfer(id) }
    fun reject(id: String, reason: String?) = act(id) { repository.rejectStockTransfer(id, reason) }
    fun receive(id: String) = act(id) { repository.receiveStockTransfer(id) }
    fun cancel(id: String, reason: String?) = act(id) { repository.cancelStockTransfer(id, reason) }

    private fun act(id: String, block: suspend () -> Result<Unit>) {
        if (_uiState.value.actingId != null) return
        _uiState.update { it.copy(actingId = id, error = null, notice = null) }
        viewModelScope.launch {
            block()
                .onSuccess { _uiState.update { s -> s.copy(actingId = null, notice = "Transfer updated.") } }
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
