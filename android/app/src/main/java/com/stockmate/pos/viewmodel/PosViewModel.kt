package com.stockmate.pos.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stockmate.pos.data.FirebaseRepository
import com.stockmate.pos.data.models.*
import com.stockmate.pos.util.PosCheckout
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PosUiState(
    val cart: List<CartItem> = emptyList(),
    val isCheckingOut: Boolean = false,
    val barcodeInput: String = "",
    val searchQuery: String = "",
    val searchResults: List<Product> = emptyList(),
    val isSearching: Boolean = false,
    val scannerVisible: Boolean = false,
    val addedNotice: String? = null,
    val paymentMethod: String = "CASH",
    val pwdOrSenior: Boolean = false,
    val amountTendered: String = "",
    val gcashReference: String = "",
    val error: String? = null,
    val lastSale: Sale? = null,
) {
    val subtotal: Double get() = cart.sumOf { it.lineTotal }
    val itemCount: Int get() = cart.sumOf { it.quantity }

    val checkoutEstimate: PosCheckout.SaleEstimate
        get() = PosCheckout.estimateSaleTotal(subtotal, pwdOrSenior)
}

class PosViewModel(
    private val repository: FirebaseRepository = FirebaseRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(PosUiState())
    val uiState: StateFlow<PosUiState> = _uiState.asStateFlow()
    private var searchJob: Job? = null

    fun addProduct(product: Product) {
        _uiState.update { state ->
            val existing = state.cart.find { it.product.id == product.id }
            val newCart = if (existing != null) {
                state.cart.map {
                    if (it.product.id == product.id) it.copy(quantity = it.quantity + 1) else it
                }
            } else {
                state.cart + CartItem(product, 1)
            }
            state.copy(cart = newCart, error = null)
        }
    }

    /** Add a product chosen from inline search, then clear the search field. */
    fun addFromSearch(product: Product) {
        addProduct(product)
        searchJob?.cancel()
        _uiState.update {
            it.copy(
                searchQuery = "",
                searchResults = emptyList(),
                isSearching = false,
                addedNotice = "Added ${product.name}",
            )
        }
    }

    fun setSearchQuery(user: User, query: String) {
        _uiState.update { it.copy(searchQuery = query, addedNotice = null) }
        searchJob?.cancel()
        if (query.isBlank()) {
            _uiState.update { it.copy(searchResults = emptyList(), isSearching = false) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(250)
            _uiState.update { it.copy(isSearching = true, error = null) }
            try {
                val products = repository.searchProducts(user.storeId, user.branchId, query)
                _uiState.update { it.copy(isSearching = false, searchResults = products) }
            } catch (e: CancellationException) {
                throw e // a newer keystroke cancelled this search — not an error
            } catch (e: Exception) {
                _uiState.update { it.copy(isSearching = false, error = e.message) }
            }
        }
    }

    fun clearSearch() {
        searchJob?.cancel()
        _uiState.update {
            it.copy(searchQuery = "", searchResults = emptyList(), isSearching = false)
        }
    }

    fun toggleScanner() {
        _uiState.update { it.copy(scannerVisible = !it.scannerVisible, error = null) }
    }

    fun dismissAddedNotice() {
        _uiState.update { it.copy(addedNotice = null) }
    }

    fun updateQuantity(productId: String, quantity: Int) {
        _uiState.update { state ->
            if (quantity <= 0) {
                state.copy(cart = state.cart.filter { it.product.id != productId })
            } else {
                state.copy(
                    cart = state.cart.map {
                        if (it.product.id == productId) it.copy(quantity = quantity) else it
                    },
                )
            }
        }
    }

    fun removeItem(productId: String) {
        _uiState.update { it.copy(cart = it.cart.filter { item -> item.product.id != productId }) }
    }

    fun setPaymentMethod(method: String) {
        _uiState.update { it.copy(paymentMethod = method, error = null) }
    }

    fun setPwdOrSenior(value: Boolean) {
        _uiState.update { it.copy(pwdOrSenior = value, error = null) }
    }

    fun setAmountTendered(value: String) {
        _uiState.update { it.copy(amountTendered = PosCheckout.sanitizeMoneyInput(value), error = null) }
    }

    fun setGcashReference(value: String) {
        _uiState.update { it.copy(gcashReference = value, error = null) }
    }

    fun openCheckout() {
        resetCheckoutFields()
    }

    fun dismissCheckout() {
        resetCheckoutFields()
    }

    fun resetCheckoutFields() {
        _uiState.update {
            it.copy(
                paymentMethod = "CASH",
                pwdOrSenior = false,
                amountTendered = "",
                gcashReference = "",
                error = null,
            )
        }
    }

    fun setBarcodeInput(value: String) {
        _uiState.update { it.copy(barcodeInput = value) }
    }

    fun scanBarcode(user: User) {
        val barcode = _uiState.value.barcodeInput.trim()
        if (barcode.isEmpty()) return
        viewModelScope.launch {
            runCatching {
                repository.findProductByBarcode(user.storeId, user.branchId, barcode)
            }.onSuccess { product ->
                if (product != null) {
                    addProduct(product)
                    _uiState.update { it.copy(barcodeInput = "", error = null, addedNotice = "Added ${product.name}") }
                } else {
                    _uiState.update { it.copy(error = "Product not found for barcode: $barcode") }
                }
            }.onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun checkout(user: User, onSuccess: (Sale) -> Unit) {
        val state = _uiState.value
        if (state.cart.isEmpty()) {
            _uiState.update { it.copy(error = "Cart is empty") }
            return
        }

        val totalDue = state.checkoutEstimate.total
        val tendered = PosCheckout.parseMoney(state.amountTendered)

        when (state.paymentMethod) {
            "CASH" -> {
                if (tendered == null) {
                    _uiState.update { it.copy(error = "Enter amount tendered") }
                    return
                }
                if (!PosCheckout.tenderCoversTotal(tendered, totalDue)) {
                    _uiState.update { it.copy(error = "Amount tendered must be at least the total due") }
                    return
                }
            }
            "GCASH" -> {
                if (state.gcashReference.trim().isEmpty()) {
                    _uiState.update { it.copy(error = "GCash reference number is required") }
                    return
                }
            }
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isCheckingOut = true, error = null) }
            val inputs = state.cart.map { CartItemInput(it.product.id, it.quantity) }
            runCatching {
                repository.createSale(
                    branchId = user.branchId,
                    items = inputs,
                    paymentMethod = state.paymentMethod,
                    pwdOrSeniorDiscount = state.pwdOrSenior,
                    amountTendered = if (state.paymentMethod == "CASH") tendered else null,
                    paymentReference = if (state.paymentMethod == "GCASH") {
                        state.gcashReference.trim()
                    } else {
                        null
                    },
                )
            }.onSuccess { result ->
                _uiState.update {
                    it.copy(
                        isCheckingOut = false,
                        cart = emptyList(),
                        lastSale = result.sale,
                        amountTendered = "",
                        gcashReference = "",
                        pwdOrSenior = false,
                        paymentMethod = "CASH",
                    )
                }
                onSuccess(result.sale)
            }.onFailure { e ->
                _uiState.update { it.copy(isCheckingOut = false, error = e.message) }
            }
        }
    }

    fun clearCart() {
        _uiState.update { it.copy(cart = emptyList(), lastSale = null, error = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
