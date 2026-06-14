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
    val isCheckingSession: Boolean = true,
    val isSigningIn: Boolean = false,
    val user: User? = null,
    val store: Store? = null,
    val error: String? = null,
) {
    val isLoading: Boolean get() = isCheckingSession || isSigningIn
}

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
            _uiState.update { it.copy(isCheckingSession = true, error = null) }
            if (repository.currentUid == null) {
                _uiState.update { it.copy(isCheckingSession = false, user = null, store = null) }
                return@launch
            }
            repository.loadCurrentUser()
                .onSuccess { user ->
                    val store = repository.getStore(user.storeId)
                    _uiState.update { it.copy(isCheckingSession = false, user = user, store = store) }
                }
                .onFailure { e ->
                    repository.signOut()
                    _uiState.update {
                        it.copy(isCheckingSession = false, user = null, error = friendlyAuthError(e.message))
                    }
                }
        }
    }

    fun signInWithGoogle(idToken: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSigningIn = true, error = null) }
            repository.signInWithGoogle(idToken)
                .onSuccess { user ->
                    val store = repository.getStore(user.storeId)
                    _uiState.update { it.copy(isSigningIn = false, user = user, store = store) }
                }
                .onFailure { e ->
                    repository.signOut()
                    _uiState.update {
                        it.copy(isSigningIn = false, error = friendlyAuthError(e.message))
                    }
                }
        }
    }

    fun reportSignInError(message: String) {
        _uiState.update { it.copy(isSigningIn = false, error = message) }
    }

    fun signOut() {
        repository.signOut()
        _uiState.update { AuthUiState(isCheckingSession = false) }
    }

    private fun friendlyAuthError(message: String?): String {
        val text = message?.trim().orEmpty()
        if (text.isBlank()) return "Sign-in failed. Please try again."
        if (text.contains("firebase", ignoreCase = true) || text.contains("Firestore", ignoreCase = true)) {
            return "Could not load your profile. Please try again."
        }
        return text
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
