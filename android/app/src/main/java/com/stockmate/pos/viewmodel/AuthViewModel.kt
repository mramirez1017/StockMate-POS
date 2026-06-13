package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.Store
import com.stockmate.pos.data.models.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AuthUiState(
    val isLoading: Boolean = true,
    val user: User? = null,
    val store: Store? = null,
    val error: String? = null,
)

class AuthViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        checkSession()
    }

    fun checkSession() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            if (repository.currentUid == null) {
                _uiState.update { it.copy(isLoading = false, user = null, store = null) }
                return@launch
            }
            repository.loadCurrentUser()
                .onSuccess { user ->
                    val store = repository.getStore(user.storeId)
                    _uiState.update { it.copy(isLoading = false, user = user, store = store) }
                }
                .onFailure { e ->
                    repository.signOut()
                    _uiState.update { it.copy(isLoading = false, user = null, error = e.message) }
                }
        }
    }

    fun signInWithGoogle(idToken: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            repository.signInWithGoogle(idToken)
                .onSuccess { user ->
                    val store = repository.getStore(user.storeId)
                    _uiState.update { it.copy(isLoading = false, user = user, store = store) }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isLoading = false, error = e.message) }
                }
        }
    }

    fun signOut() {
        repository.signOut()
        _uiState.update { AuthUiState(isLoading = false) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
