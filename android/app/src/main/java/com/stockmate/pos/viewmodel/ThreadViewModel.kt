package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.ThreadMessage
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ThreadUiState(
    val threadId: String? = null,
    val messages: List<ThreadMessage> = emptyList(),
    val input: String = "",
    val sending: Boolean = false,
    val error: String? = null,
)

class ThreadViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(ThreadUiState())
    val uiState: StateFlow<ThreadUiState> = _uiState.asStateFlow()

    val myUid: String? get() = repository.currentUid

    private var observeJob: Job? = null
    private var lastReadAt: Long = 0L

    fun start(storeId: String, contextType: String, contextId: String) {
        observeJob?.cancel()
        observeJob = viewModelScope.launch {
            repository.observeContextThread(storeId, contextType, contextId).collect { snap ->
                _uiState.update { it.copy(threadId = snap.threadId, messages = snap.messages) }
                val latest = snap.messages.lastOrNull()?.createdAt ?: 0L
                if (snap.threadId != null && latest > lastReadAt) {
                    lastReadAt = latest
                    runCatching { repository.markThreadRead(snap.threadId) }
                }
            }
        }
    }

    fun updateInput(value: String) {
        _uiState.update { it.copy(input = value) }
    }

    fun send(contextType: String, contextId: String, title: String, branchId: String) {
        val text = _uiState.value.input.trim()
        if (text.isEmpty() || _uiState.value.sending) return
        viewModelScope.launch {
            _uiState.update { it.copy(sending = true, error = null) }
            runCatching {
                repository.sendMessage(_uiState.value.threadId, contextType, contextId, title, branchId, text)
            }.onSuccess {
                _uiState.update { it.copy(sending = false, input = "") }
            }.onFailure { e ->
                _uiState.update { it.copy(sending = false, error = e.message) }
            }
        }
    }

    override fun onCleared() {
        observeJob?.cancel()
        super.onCleared()
    }
}
