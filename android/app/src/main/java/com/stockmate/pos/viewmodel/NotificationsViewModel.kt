package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.StoreNotification
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NotificationsUiState(
    val notifications: List<StoreNotification> = emptyList(),
    val unreadCount: Int = 0,
)

class NotificationsViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()

    private var observeJob: Job? = null

    fun start(storeId: String, uid: String) {
        if (observeJob != null) return
        observeJob = viewModelScope.launch {
            repository.observeNotifications(storeId, uid).collect { list ->
                _uiState.update {
                    it.copy(notifications = list, unreadCount = list.count { n -> !n.read })
                }
            }
        }
    }

    fun markRead(notificationId: String) {
        viewModelScope.launch { runCatching { repository.markNotificationRead(notificationId) } }
    }

    fun markAllRead() {
        viewModelScope.launch { runCatching { repository.markAllNotificationsRead() } }
    }

    override fun onCleared() {
        observeJob?.cancel()
        super.onCleared()
    }
}
