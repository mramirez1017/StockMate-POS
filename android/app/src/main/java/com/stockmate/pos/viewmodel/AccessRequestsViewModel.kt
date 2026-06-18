package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.PermissionRequest
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AccessRequestsUiState(
    val requests: List<PermissionRequest> = emptyList(),
    val isLoading: Boolean = true,
    val submitting: Boolean = false,
    val actingId: String? = null,
    val error: String? = null,
    val notice: String? = null,
)

class AccessRequestsViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(AccessRequestsUiState())
    val uiState: StateFlow<AccessRequestsUiState> = _uiState.asStateFlow()

    val currentUid: String? get() = repository.currentUid

    private var observeJob: Job? = null

    fun start(storeId: String) {
        if (observeJob != null) return
        observeJob = viewModelScope.launch {
            repository.observePermissionRequests(storeId).collect { list ->
                _uiState.update { it.copy(requests = list, isLoading = false) }
            }
        }
    }

    fun submitRequest(permissionKey: String, reason: String?) {
        if (_uiState.value.submitting) return
        _uiState.update { it.copy(submitting = true, error = null, notice = null) }
        viewModelScope.launch {
            repository.createPermissionRequest(permissionKey, reason)
                .onSuccess { _uiState.update { s -> s.copy(submitting = false, notice = "Request sent for approval.") } }
                .onFailure { e -> _uiState.update { s -> s.copy(submitting = false, error = friendly(e)) } }
        }
    }

    fun approve(requestId: String) = act(requestId) { repository.approvePermissionRequest(requestId) }

    fun reject(requestId: String) = act(requestId) { repository.rejectPermissionRequest(requestId) }

    private fun act(requestId: String, block: suspend () -> Result<Unit>) {
        if (_uiState.value.actingId != null) return
        _uiState.update { it.copy(actingId = requestId, error = null, notice = null) }
        viewModelScope.launch {
            block()
                .onSuccess { _uiState.update { s -> s.copy(actingId = null, notice = "Request updated.") } }
                .onFailure { e -> _uiState.update { s -> s.copy(actingId = null, error = friendly(e)) } }
        }
    }

    fun consumeMessages() {
        _uiState.update { it.copy(error = null, notice = null) }
    }

    private fun friendly(e: Throwable): String {
        val raw = e.message.orEmpty()
        return raw.ifBlank { "Something went wrong. Please try again." }
    }

    override fun onCleared() {
        observeJob?.cancel()
        super.onCleared()
    }
}
