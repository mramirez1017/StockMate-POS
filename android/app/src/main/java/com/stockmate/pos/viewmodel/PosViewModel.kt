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

data class SplitTender(
    val method: String = "CASH",
    val amount: String = "",
    val reference: String = "",
)

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
    val manualDiscount: String = "",
    val manualDiscountReason: String = "",
    val allowManualDiscount: Boolean = false,
    val splitMode: Boolean = false,
    val splits: List<SplitTender> = listOf(SplitTender()),
    val parkedSales: List<ParkedSale> = emptyList(),
    val isParking: Boolean = false,
    val error: String? = null,
    val lastSale: Sale? = null,
) {
    val subtotal: Double get() = cart.sumOf { it.lineTotal }
    val itemCount: Int get() = cart.sumOf { it.quantity }

    val manualDiscountValue: Double
        get() = if (allowManualDiscount) (PosCheckout.parseMoney(manualDiscount) ?: 0.0) else 0.0

    val checkoutEstimate: PosCheckout.SaleEstimate
        get() = PosCheckout.estimateSaleTotal(subtotal, pwdOrSenior, 0.0, manualDiscountValue)

    val splitPaid: Double get() = splits.sumOf { PosCheckout.parseMoney(it.amount) ?: 0.0 }
    val splitRemaining: Double get() = PosCheckout.roundMoney(checkoutEstimate.total - splitPaid)
    val splitHasCash: Boolean get() = splits.any { it.method == "CASH" }
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

    fun setManualDiscount(value: String) {
        _uiState.update { it.copy(manualDiscount = PosCheckout.sanitizeMoneyInput(value), error = null) }
    }

    fun setManualDiscountReason(value: String) {
        _uiState.update { it.copy(manualDiscountReason = value) }
    }

    fun setAllowManualDiscount(value: Boolean) {
        _uiState.update { it.copy(allowManualDiscount = value) }
    }

    fun toggleSplitMode() {
        _uiState.update { it.copy(splitMode = !it.splitMode, error = null) }
    }

    fun addSplit() {
        _uiState.update { it.copy(splits = it.splits + SplitTender()) }
    }

    fun removeSplit(index: Int) {
        _uiState.update {
            if (it.splits.size <= 1) it
            else it.copy(splits = it.splits.filterIndexed { i, _ -> i != index })
        }
    }

    fun updateSplit(index: Int, method: String? = null, amount: String? = null, reference: String? = null) {
        _uiState.update { state ->
            state.copy(
                splits = state.splits.mapIndexed { i, s ->
                    if (i != index) s
                    else s.copy(
                        method = method ?: s.method,
                        amount = amount?.let { PosCheckout.sanitizeMoneyInput(it) } ?: s.amount,
                        reference = reference ?: s.reference,
                    )
                },
                error = null,
            )
        }
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
                manualDiscount = "",
                manualDiscountReason = "",
                splitMode = false,
                splits = listOf(SplitTender()),
                error = null,
            )
        }
    }

    // ── Held / parked sales ────────────────────────────────────────────────────

    private var parkedJob: Job? = null

    fun startParkedObserver(user: User) {
        parkedJob?.cancel()
        parkedJob = viewModelScope.launch {
            repository.observeParkedSales(user.storeId, user.branchId).collect { list ->
                _uiState.update { it.copy(parkedSales = list) }
            }
        }
    }

    fun parkCurrentCart(user: User, label: String?) {
        val state = _uiState.value
        if (state.cart.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isParking = true, error = null) }
            val items = state.cart.map { CartItemInput(it.product.id, it.quantity) }
            repository.parkSale(user.branchId, items, label)
                .onSuccess { _uiState.update { it.copy(isParking = false, cart = emptyList()) } }
                .onFailure { e -> _uiState.update { it.copy(isParking = false, error = e.message) } }
        }
    }

    /**
     * Rebuild the cart from a held sale's snapshot, then delete it. Stock is
     * re-validated server-side at checkout, so we trust the snapshot here.
     */
    fun resumeParked(parked: ParkedSale) {
        val lines = parked.items
            .filter { it.quantity > 0 }
            .map { item ->
                CartItem(
                    product = Product(
                        id = item.productId,
                        name = item.productName,
                        sellingPrice = item.unitPrice,
                    ),
                    quantity = item.quantity,
                )
            }
        _uiState.update { it.copy(cart = lines, error = null) }
        viewModelScope.launch { repository.deleteParkedSale(parked.id) }
    }

    fun deleteParked(parkedSaleId: String) {
        viewModelScope.launch { repository.deleteParkedSale(parkedSaleId) }
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

        var splitPayments: List<SalePayment> = emptyList()
        if (state.splitMode) {
            splitPayments = state.splits.mapNotNull { s ->
                val amount = PosCheckout.parseMoney(s.amount) ?: return@mapNotNull null
                if (amount <= 0) null else SalePayment(s.method, amount, s.reference.trim().ifBlank { null })
            }
            if (splitPayments.isEmpty()) {
                _uiState.update { it.copy(error = "Enter at least one split payment") }
                return
            }
            if (!PosCheckout.tenderCoversTotal(state.splitPaid, totalDue)) {
                _uiState.update { it.copy(error = "Split payments must cover at least the total due") }
                return
            }
            if (splitPayments.any { it.method == "GCASH" && it.reference.isNullOrBlank() }) {
                _uiState.update { it.copy(error = "Enter a reference for each GCash split payment") }
                return
            }
            if (!state.splitHasCash &&
                kotlin.math.round(state.splitPaid * 100) != kotlin.math.round(totalDue * 100)
            ) {
                _uiState.update { it.copy(error = "Without a cash tender, split payments must total exactly the amount due") }
                return
            }
        } else when (state.paymentMethod) {
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

        val effectiveMethod = if (state.splitMode) {
            if (splitPayments.size == 1) splitPayments.first().method else "SPLIT"
        } else {
            state.paymentMethod
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isCheckingOut = true, error = null) }
            val inputs = state.cart.map { CartItemInput(it.product.id, it.quantity) }
            runCatching {
                repository.createSale(
                    branchId = user.branchId,
                    items = inputs,
                    paymentMethod = effectiveMethod,
                    pwdOrSeniorDiscount = state.pwdOrSenior,
                    amountTendered = if (!state.splitMode && state.paymentMethod == "CASH") tendered else null,
                    paymentReference = if (!state.splitMode && state.paymentMethod == "GCASH") {
                        state.gcashReference.trim()
                    } else {
                        null
                    },
                    manualDiscount = state.manualDiscountValue.takeIf { it > 0 },
                    manualDiscountReason = state.manualDiscountReason.trim().ifBlank { null },
                    payments = splitPayments,
                )
            }.onSuccess { result ->
                _uiState.update {
                    it.copy(
                        isCheckingOut = false,
                        cart = emptyList(),
                        lastSale = result.sale,
                        amountTendered = "",
                        gcashReference = "",
                        manualDiscount = "",
                        manualDiscountReason = "",
                        splitMode = false,
                        splits = listOf(SplitTender()),
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
