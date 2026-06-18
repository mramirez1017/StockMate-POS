package com.stockmate.pos.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.functions.FirebaseFunctions
import com.stockmate.pos.data.models.*
import com.stockmate.pos.util.NumberInput
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class FirebaseRepository {

    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()
    private val functions = FirebaseFunctions.getInstance("us-central1")

    val currentUid: String? get() = auth.currentUser?.uid

    suspend fun signInWithGoogle(idToken: String): Result<User> = runCatching {
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        auth.signInWithCredential(credential).await()
        loadCurrentUser().getOrThrow()
    }

    fun signOut() {
        auth.signOut()
    }

    suspend fun loadCurrentUser(): Result<User> = runCatching {
        val uid = currentUid ?: error("Not signed in")

        var indexSnap = readUserStoreIndex(uid)
        if (indexSnap == null) {
            claimAccountIfNeeded()
            indexSnap = readUserStoreIndex(uid)
        }
        if (indexSnap == null || !indexSnap.exists()) {
            error("Your email is not registered. Contact your administrator to be added.")
        }

        val indexData = indexSnap.data ?: emptyMap()
        if (indexData["isPlatformOwner"] == true || indexData["role"] == "PLATFORM_OWNER") {
            error("Platform owner accounts use the web app.")
        }

        val storeId = indexSnap.getString("storeId") ?: error("Missing storeId")
        var userSnap = db.collection("stores").document(storeId)
            .collection("users").document(uid).get().await()
        if (!userSnap.exists()) {
            delay(500)
            userSnap = db.collection("stores").document(storeId)
                .collection("users").document(uid).get().await()
        }
        if (!userSnap.exists()) error("User profile not found")

        parseUser(userSnap.id, userSnap.data ?: emptyMap()).also { user ->
            if (user.status != EntityStatus.ACTIVE) error("Account is inactive")
            if (!user.canAccessPos) error("Role not allowed on mobile")
            if (user.role in listOf(UserRole.CASHIER, UserRole.STORE_MANAGER) && user.branchId.isBlank()) {
                error("No branch assigned. Contact your administrator.")
            }
            if (user.storeId.isNotBlank() && user.storeId != storeId) {
                error("Store assignment mismatch. Contact your administrator.")
            }
        }
    }

    private suspend fun readUserStoreIndex(uid: String, retries: Int = 4): DocumentSnapshot? {
        repeat(retries) { attempt ->
            val snap = db.collection("userStoreIndex").document(uid).get().await()
            if (snap.exists()) return snap
            if (attempt < retries - 1) delay(400L * (attempt + 1))
        }
        val snap = db.collection("userStoreIndex").document(uid).get().await()
        return snap.takeIf { it.exists() }
    }

    private suspend fun claimAccountIfNeeded() {
        try {
            functions.getHttpsCallable("claimAccount").call(emptyMap<String, Any>()).await()
        } catch (e: Exception) {
            val raw = e.message.orEmpty()
            val friendly = when {
                raw.contains("not registered", ignoreCase = true) ->
                    "Your email is not registered. Contact your administrator."
                raw.contains("inactive", ignoreCase = true) ->
                    "Your account registration is inactive."
                raw.contains("already been used", ignoreCase = true) ->
                    "This email has already been used to sign in."
                raw.contains("missing branch", ignoreCase = true) ->
                    "Your account is missing a branch. Contact your administrator."
                else -> null
            }
            if (friendly != null) throw IllegalStateException(friendly)
        }
    }

    suspend fun getStore(storeId: String): Store? {
        val snap = db.collection("stores").document(storeId).get().await()
        if (!snap.exists()) return null
        val data = snap.data ?: return null
        return Store(
            id = snap.id,
            name = data["name"] as? String ?: "",
            taxRate = (data["taxRate"] as? Number)?.toDouble() ?: 0.0,
            taxInclusive = data["taxInclusive"] as? Boolean ?: false,
            currency = data["currency"] as? String ?: "PHP",
            receiptHeader = data["receiptHeader"] as? String,
            receiptFooter = data["receiptFooter"] as? String,
            paymentMethods = (data["paymentMethods"] as? List<*>)?.mapNotNull { it as? String }
                ?: listOf("CASH", "CARD"),
        )
    }

    suspend fun getDashboardStats(storeId: String): DashboardStats? {
        val snap = db.collection("stores").document(storeId)
            .collection("dashboardStats").document("main").get().await()
        if (!snap.exists()) return null
        val d = snap.data ?: return null
        return DashboardStats(
            todaySales = (d["todaySales"] as? Number)?.toDouble() ?: 0.0,
            todayTransactions = (d["todayTransactions"] as? Number)?.toInt() ?: 0,
            criticalStockCount = (d["criticalStockCount"] as? Number)?.toInt() ?: 0,
            pendingDeliveries = (d["pendingDeliveries"] as? Number)?.toInt() ?: 0,
        )
    }

    suspend fun searchProducts(storeId: String, branchId: String, query: String): List<Product> {
        val productsSnap = db.collection("stores").document(storeId)
            .collection("products")
            .whereEqualTo("status", "ACTIVE")
            .get().await()
        val categories = loadCategoriesMap(storeId)
        val q = query.trim().lowercase()
        return productsSnap.documents.mapNotNull { doc ->
            val product = parseProduct(doc.id, doc.data ?: return@mapNotNull null)
            val stock = getInventoryStock(storeId, branchId, product.id)
            product.copy(
                currentStock = stock,
                categoryName = categories[product.categoryId],
            )
        }.filter { p ->
            q.isEmpty() ||
                p.name.lowercase().contains(q) ||
                p.sku?.lowercase()?.contains(q) == true ||
                p.barcode?.contains(q) == true ||
                p.internalBarcode?.contains(q) == true
        }.sortedBy { it.name }
    }

    suspend fun findProductByBarcode(storeId: String, branchId: String, barcode: String): Product? {
        val trimmed = barcode.trim()
        if (trimmed.isEmpty()) return null
        val col = db.collection("stores").document(storeId).collection("products")
        val byBarcode = col.whereEqualTo("barcode", trimmed).whereEqualTo("status", "ACTIVE")
            .get().await()
        val byInternal = col.whereEqualTo("internalBarcode", trimmed).whereEqualTo("status", "ACTIVE")
            .get().await()
        val doc = byBarcode.documents.firstOrNull() ?: byInternal.documents.firstOrNull() ?: return null
        val product = parseProduct(doc.id, doc.data ?: return null)
        val stock = getInventoryStock(storeId, branchId, product.id)
        val categories = loadCategoriesMap(storeId)
        return product.copy(currentStock = stock, categoryName = categories[product.categoryId])
    }

    /** Products without manufacturer or internal barcode — for cashier assignment flow */
    suspend fun listProductsMissingBarcode(storeId: String, branchId: String, query: String = ""): List<Product> {
        val productsSnap = db.collection("stores").document(storeId)
            .collection("products")
            .whereEqualTo("status", "ACTIVE")
            .get().await()
        val categories = loadCategoriesMap(storeId)
        val q = query.trim().lowercase()
        return productsSnap.documents.mapNotNull { doc ->
            val product = parseProduct(doc.id, doc.data ?: return@mapNotNull null)
            if (!product.barcode.isNullOrBlank() || !product.internalBarcode.isNullOrBlank()) return@mapNotNull null
            if (q.isNotEmpty() && !product.name.lowercase().contains(q) && product.sku?.lowercase()?.contains(q) != true) {
                return@mapNotNull null
            }
            val stock = getInventoryStock(storeId, branchId, product.id)
            product.copy(
                currentStock = stock,
                categoryName = categories[product.categoryId],
            )
        }.sortedBy { it.name }
    }

    suspend fun updateProductBarcode(productId: String, barcode: String): Result<String> = runCatching {
        val trimmed = barcode.trim()
        if (trimmed.isEmpty()) error("Barcode is required")
        val result = functions.getHttpsCallable("updateProductBarcode")
            .call(mapOf("productId" to productId, "barcode" to trimmed))
            .await()
        val data = result.data as? Map<*, *>
        data?.get("barcode") as? String ?: trimmed
    }

    suspend fun getProductWithStock(storeId: String, branchId: String, productId: String): Product? {
        val snap = db.collection("stores").document(storeId)
            .collection("products").document(productId).get().await()
        if (!snap.exists()) return null
        val product = parseProduct(snap.id, snap.data ?: return null)
        val stock = getInventoryStock(storeId, branchId, product.id)
        val categories = loadCategoriesMap(storeId)
        return product.copy(currentStock = stock, categoryName = categories[product.categoryId])
    }

    suspend fun getUpcomingPurchaseOrders(storeId: String, branchId: String): List<PurchaseOrder> {
        val snap = db.collection("stores").document(storeId)
            .collection("purchaseOrders")
            .whereEqualTo("branchId", branchId)
            .get().await()
        return snap.documents.mapNotNull { doc ->
            parsePurchaseOrder(doc.id, doc.data ?: return@mapNotNull null)
        }.filter { it.status in listOf(POStatus.ORDERED, POStatus.IN_TRANSIT, POStatus.PARTIALLY_RECEIVED) }
            .sortedBy { it.expectedDeliveryDate }
    }

    suspend fun getPurchaseOrder(storeId: String, poId: String): PurchaseOrder? {
        val snap = db.collection("stores").document(storeId)
            .collection("purchaseOrders").document(poId).get().await()
        if (!snap.exists()) return null
        return parsePurchaseOrder(snap.id, snap.data ?: return null)
    }

    suspend fun getCriticalStocks(storeId: String, branchId: String): List<CriticalStock> {
        val snap = db.collection("stores").document(storeId)
            .collection("criticalStocks")
            .whereEqualTo("branchId", branchId)
            .get().await()
        return snap.documents.mapNotNull { doc ->
            val d = doc.data ?: return@mapNotNull null
            CriticalStock(
                id = doc.id,
                storeId = d["storeId"] as? String ?: "",
                branchId = d["branchId"] as? String ?: "",
                productId = d["productId"] as? String ?: doc.id,
                productName = d["productName"] as? String ?: "",
                currentStock = (d["currentStock"] as? Number)?.toInt() ?: 0,
                criticalLevel = (d["criticalLevel"] as? Number)?.toInt() ?: 0,
                reorderLevel = (d["reorderLevel"] as? Number)?.toInt() ?: 0,
                suggestedOrderQty = (d["suggestedOrderQty"] as? Number)?.toInt() ?: 0,
                updatedAt = (d["updatedAt"] as? Number)?.toLong() ?: 0L,
            )
        }.sortedBy { it.productName }
    }

    suspend fun getRecentSales(storeId: String, branchId: String, limit: Int = 20): List<Sale> {
        val snap = db.collection("stores").document(storeId)
            .collection("sales")
            .whereEqualTo("branchId", branchId)
            .get().await()
        return snap.documents.mapNotNull { doc ->
            parseSale(doc.id, doc.data ?: return@mapNotNull null)
        }.sortedByDescending { it.createdAt }.take(limit)
    }

    suspend fun getSale(storeId: String, saleId: String): Sale? {
        val snap = db.collection("stores").document(storeId)
            .collection("sales").document(saleId).get().await()
        if (!snap.exists()) return null
        return parseSale(snap.id, snap.data ?: return null)
    }

    suspend fun createSale(
        branchId: String,
        items: List<CartItemInput>,
        paymentMethod: String,
        pwdOrSeniorDiscount: Boolean = false,
        amountTendered: Double? = null,
        paymentReference: String? = null,
        customerEmail: String? = null,
        customerPhone: String? = null,
        manualDiscount: Double? = null,
        manualDiscountReason: String? = null,
        payments: List<SalePayment> = emptyList(),
    ): CreateSaleResult {
        val data = hashMapOf<String, Any?>(
            "branchId" to branchId,
            "items" to items.map { mapOf("productId" to it.productId, "quantity" to it.quantity) },
            "paymentMethod" to paymentMethod,
        )
        if (pwdOrSeniorDiscount) data["pwdOrSeniorDiscount"] = true
        amountTendered?.let { data["amountTendered"] = it }
        paymentReference?.let { data["paymentReference"] = it }
        customerEmail?.let { data["customerEmail"] = it }
        customerPhone?.let { data["customerPhone"] = it }
        if (manualDiscount != null && manualDiscount > 0) {
            data["manualDiscount"] = manualDiscount
            if (!manualDiscountReason.isNullOrBlank()) data["manualDiscountReason"] = manualDiscountReason.trim()
        }
        if (payments.isNotEmpty()) {
            data["payments"] = payments.map { p ->
                val m = hashMapOf<String, Any?>("method" to p.method, "amount" to p.amount)
                if (!p.reference.isNullOrBlank()) m["reference"] = p.reference
                m
            }
        }
        val result = functions.getHttpsCallable("createSale").call(data).await()
        return parseCreateSaleResult(result.data)
    }

    // ── Parked / held sales ────────────────────────────────────────────────────

    fun observeParkedSales(storeId: String, branchId: String): Flow<List<ParkedSale>> = callbackFlow {
        val reg = db.collection("stores").document(storeId).collection("parkedSales")
            .whereEqualTo("branchId", branchId)
            .addSnapshotListener { snap, _ ->
                val list = snap?.documents
                    ?.mapNotNull { parseParkedSale(it.id, it.data ?: return@mapNotNull null) }
                    ?.sortedByDescending { it.createdAt }
                    ?: emptyList()
                trySend(list)
            }
        awaitClose { reg.remove() }
    }

    suspend fun parkSale(
        branchId: String,
        items: List<CartItemInput>,
        label: String?,
    ): Result<String> = runCatching {
        val data = hashMapOf<String, Any?>(
            "branchId" to branchId,
            "items" to items.map { mapOf("productId" to it.productId, "quantity" to it.quantity) },
        )
        if (!label.isNullOrBlank()) data["label"] = label.trim()
        val result = functions.getHttpsCallable("parkSale").call(data).await()
        (result.data as? Map<*, *>)?.get("parkedSaleId") as? String ?: ""
    }

    suspend fun deleteParkedSale(parkedSaleId: String): Result<Unit> = runCatching {
        functions.getHttpsCallable("deleteParkedSale")
            .call(mapOf("parkedSaleId" to parkedSaleId)).await()
        Unit
    }

    private fun parseParkedSale(id: String, data: Map<String, Any?>): ParkedSale {
        val rawItems = data["items"] as? List<*> ?: emptyList<Any?>()
        val items = rawItems.mapNotNull { entry ->
            val m = entry as? Map<*, *> ?: return@mapNotNull null
            ParkedSaleItem(
                productId = m["productId"] as? String ?: "",
                productName = m["productName"] as? String ?: "",
                quantity = (m["quantity"] as? Number)?.toInt() ?: 0,
                unitPrice = (m["unitPrice"] as? Number)?.toDouble() ?: 0.0,
            )
        }
        return ParkedSale(
            id = id,
            branchId = data["branchId"] as? String ?: "",
            label = data["label"] as? String ?: "",
            items = items,
            note = data["note"] as? String,
            customerName = data["customerName"] as? String,
            itemCount = (data["itemCount"] as? Number)?.toInt() ?: items.size,
            estimatedTotal = (data["estimatedTotal"] as? Number)?.toDouble() ?: 0.0,
            parkedBy = data["parkedBy"] as? String ?: "",
            parkedByName = data["parkedByName"] as? String ?: "",
            createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
        )
    }

    // ── Stock counts (physical stock-take) ─────────────────────────────────────

    fun observeStockCounts(storeId: String): Flow<List<StockCount>> = callbackFlow {
        val reg = db.collection("stores").document(storeId).collection("stockCounts")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(100)
            .addSnapshotListener { snap, _ ->
                val list = snap?.documents
                    ?.mapNotNull { parseStockCount(it.id, it.data ?: return@mapNotNull null) }
                    ?: emptyList()
                trySend(list)
            }
        awaitClose { reg.remove() }
    }

    suspend fun createStockCount(
        branchId: String,
        scope: String,
        productIds: List<String>?,
        notes: String?,
    ): Result<String> = runCatching {
        val data = hashMapOf<String, Any?>("branchId" to branchId, "scope" to scope)
        if (scope == "PARTIAL" && productIds != null) data["productIds"] = productIds
        if (!notes.isNullOrBlank()) data["notes"] = notes.trim()
        val result = functions.getHttpsCallable("createStockCount").call(data).await()
        (result.data as? Map<*, *>)?.get("countId") as? String ?: ""
    }

    suspend fun submitStockCount(
        countId: String,
        counts: List<Pair<String, Int>>,
    ): Result<Unit> = runCatching {
        val data = hashMapOf<String, Any?>(
            "countId" to countId,
            "counts" to counts.map { mapOf("productId" to it.first, "countedQty" to it.second) },
        )
        functions.getHttpsCallable("submitStockCount").call(data).await()
        Unit
    }

    suspend fun cancelStockCount(countId: String, reason: String?): Result<Unit> = runCatching {
        val data = hashMapOf<String, Any?>("countId" to countId)
        if (!reason.isNullOrBlank()) data["reason"] = reason.trim()
        functions.getHttpsCallable("cancelStockCount").call(data).await()
        Unit
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseStockCount(id: String, data: Map<String, Any?>): StockCount {
        val rawItems = data["items"] as? List<*> ?: emptyList<Any?>()
        val items = rawItems.mapNotNull { entry ->
            val m = entry as? Map<*, *> ?: return@mapNotNull null
            StockCountItem(
                productId = m["productId"] as? String ?: "",
                productName = m["productName"] as? String ?: "",
                expectedQty = (m["expectedQty"] as? Number)?.toInt() ?: 0,
                countedQty = (m["countedQty"] as? Number)?.toInt(),
                variance = (m["variance"] as? Number)?.toInt(),
            )
        }
        return StockCount(
            id = id,
            branchId = data["branchId"] as? String ?: "",
            countNumber = data["countNumber"] as? String ?: "",
            scope = data["scope"] as? String ?: "FULL",
            status = data["status"] as? String ?: "IN_PROGRESS",
            items = items,
            notes = data["notes"] as? String,
            totalVarianceUnits = (data["totalVarianceUnits"] as? Number)?.toInt(),
            countedItems = (data["countedItems"] as? Number)?.toInt(),
            varianceItems = (data["varianceItems"] as? Number)?.toInt(),
            startedBy = data["startedBy"] as? String ?: "",
            startedByName = data["startedByName"] as? String ?: "",
            startedAt = (data["startedAt"] as? Number)?.toLong() ?: 0L,
            completedByName = data["completedByName"] as? String,
            completedAt = (data["completedAt"] as? Number)?.toLong(),
            cancelledByName = data["cancelledByName"] as? String,
            cancelledAt = (data["cancelledAt"] as? Number)?.toLong(),
            cancelReason = data["cancelReason"] as? String,
            createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
        )
    }

    suspend fun receiveDelivery(
        purchaseOrderId: String,
        items: List<ReceiveItemInput>,
        supplierDeliveryNumber: String? = null,
    ): ReceiveDeliveryResult {
        val data = hashMapOf<String, Any?>(
            "purchaseOrderId" to purchaseOrderId,
            "items" to items.map {
                mapOf(
                    "productId" to it.productId,
                    "receivedQty" to NumberInput.parseInteger(it.receivedQty),
                    "damagedQty" to NumberInput.parseInteger(it.damagedQty).takeIf { qty -> qty > 0 },
                    "expiryDate" to it.expiryDate.ifBlank { null },
                    "remarks" to it.remarks.ifBlank { null },
                )
            },
        )
        supplierDeliveryNumber?.let { data["supplierDeliveryNumber"] = it }
        val result = functions.getHttpsCallable("receiveDelivery").call(data).await()
        return parseReceiveDeliveryResult(result.data)
    }

    suspend fun createDisposal(
        branchId: String,
        productId: String,
        quantity: Int,
        reason: DisposalReason,
        remarks: String? = null,
    ): CreateDisposalResult {
        val data = hashMapOf<String, Any?>(
            "branchId" to branchId,
            "productId" to productId,
            "quantity" to quantity,
            "reason" to reason.name,
            "remarks" to remarks,
        )
        val result = functions.getHttpsCallable("createDisposal").call(data).await()
        val map = result.data as? Map<*, *> ?: error("Invalid response")
        return CreateDisposalResult(disposalId = map["disposalId"] as? String ?: "")
    }

    suspend fun createPurchaseRequest(
        productId: String,
        suggestedQty: Int,
        notes: String? = null,
    ): CreatePurchaseRequestResult {
        val data = hashMapOf<String, Any?>(
            "productId" to productId,
            "suggestedQty" to suggestedQty,
            "notes" to notes,
        )
        val result = functions.getHttpsCallable("createPurchaseRequest").call(data).await()
        val map = result.data as? Map<*, *> ?: error("Invalid response")
        return CreatePurchaseRequestResult(purchaseRequestId = map["purchaseRequestId"] as? String ?: "")
    }

    // ── Permission (access) requests ──────────────────────────────────────────

    fun observePermissionRequests(storeId: String): Flow<List<PermissionRequest>> = callbackFlow {
        val reg = db.collection("stores").document(storeId).collection("permissionRequests")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(100)
            .addSnapshotListener { snap, _ ->
                val list = snap?.documents
                    ?.mapNotNull { parsePermissionRequest(it.id, it.data ?: return@mapNotNull null) }
                    ?: emptyList()
                trySend(list)
            }
        awaitClose { reg.remove() }
    }

    suspend fun createPermissionRequest(permission: String, reason: String?): Result<String> = runCatching {
        val data = hashMapOf<String, Any?>("permission" to permission)
        if (!reason.isNullOrBlank()) data["reason"] = reason.trim()
        val result = functions.getHttpsCallable("createPermissionRequest").call(data).await()
        (result.data as? Map<*, *>)?.get("permissionRequestId") as? String ?: ""
    }

    suspend fun approvePermissionRequest(requestId: String): Result<Unit> = runCatching {
        functions.getHttpsCallable("approvePermissionRequest")
            .call(mapOf("requestId" to requestId)).await()
        Unit
    }

    suspend fun rejectPermissionRequest(requestId: String): Result<Unit> = runCatching {
        functions.getHttpsCallable("rejectPermissionRequest")
            .call(mapOf("requestId" to requestId)).await()
        Unit
    }

    private fun parsePermissionRequest(id: String, data: Map<String, Any?>): PermissionRequest =
        PermissionRequest(
            id = id,
            permission = data["permission"] as? String ?: "",
            reason = data["reason"] as? String,
            status = data["status"] as? String ?: "PENDING",
            requestedBy = data["requestedBy"] as? String ?: "",
            requestedByName = data["requestedByName"] as? String ?: "",
            branchId = data["branchId"] as? String,
            createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
        )

    // ── Stock transfers (branch ↔ branch) ─────────────────────────────────────

    fun observeStockTransfers(storeId: String): Flow<List<StockTransfer>> = callbackFlow {
        val reg = db.collection("stores").document(storeId).collection("stockTransfers")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(100)
            .addSnapshotListener { snap, _ ->
                val list = snap?.documents
                    ?.mapNotNull { parseStockTransfer(it.id, it.data ?: return@mapNotNull null) }
                    ?: emptyList()
                trySend(list)
            }
        awaitClose { reg.remove() }
    }

    suspend fun loadBranchOptions(storeId: String): List<BranchOption> {
        val snap = db.collection("stores").document(storeId).collection("branches")
            .whereEqualTo("status", "ACTIVE")
            .get().await()
        return snap.documents.mapNotNull { doc ->
            val name = doc.getString("name") ?: return@mapNotNull null
            BranchOption(id = doc.id, name = name)
        }.sortedBy { it.name }
    }

    suspend fun createStockTransfer(
        fromBranchId: String,
        toBranchId: String,
        items: List<Pair<String, Int>>,
        notes: String?,
    ): Result<String> = runCatching {
        val data = hashMapOf<String, Any?>(
            "fromBranchId" to fromBranchId,
            "toBranchId" to toBranchId,
            "items" to items.map { mapOf("productId" to it.first, "quantity" to it.second) },
        )
        if (!notes.isNullOrBlank()) data["notes"] = notes.trim()
        val result = functions.getHttpsCallable("createStockTransfer").call(data).await()
        (result.data as? Map<*, *>)?.get("transferId") as? String ?: ""
    }

    suspend fun approveStockTransfer(transferId: String): Result<Unit> = runCatching {
        functions.getHttpsCallable("approveStockTransfer")
            .call(mapOf("transferId" to transferId)).await()
        Unit
    }

    suspend fun rejectStockTransfer(transferId: String, reason: String?): Result<Unit> = runCatching {
        val data = hashMapOf<String, Any?>("transferId" to transferId)
        if (!reason.isNullOrBlank()) data["reason"] = reason.trim()
        functions.getHttpsCallable("rejectStockTransfer").call(data).await()
        Unit
    }

    suspend fun receiveStockTransfer(transferId: String): Result<Unit> = runCatching {
        functions.getHttpsCallable("receiveStockTransfer")
            .call(mapOf("transferId" to transferId)).await()
        Unit
    }

    suspend fun cancelStockTransfer(transferId: String, reason: String?): Result<Unit> = runCatching {
        val data = hashMapOf<String, Any?>("transferId" to transferId)
        if (!reason.isNullOrBlank()) data["reason"] = reason.trim()
        functions.getHttpsCallable("cancelStockTransfer").call(data).await()
        Unit
    }

    // ── Returns / refunds ─────────────────────────────────────────────────────

    /** Process a (partial) return against a completed sale. items = (productId, quantity, restock). */
    suspend fun createSaleReturn(
        saleId: String,
        items: List<Triple<String, Int, Boolean>>,
        reason: String?,
        refundMethod: String?,
    ): Result<Double> = runCatching {
        val data = hashMapOf<String, Any?>(
            "saleId" to saleId,
            "items" to items.map {
                mapOf("productId" to it.first, "quantity" to it.second, "restock" to it.third)
            },
        )
        if (!reason.isNullOrBlank()) data["reason"] = reason.trim()
        if (!refundMethod.isNullOrBlank()) data["refundMethod"] = refundMethod
        val result = functions.getHttpsCallable("createSaleReturn").call(data).await()
        ((result.data as? Map<*, *>)?.get("refundTotal") as? Number)?.toDouble() ?: 0.0
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseStockTransfer(id: String, data: Map<String, Any?>): StockTransfer {
        val rawItems = data["items"] as? List<*> ?: emptyList<Any?>()
        val items = rawItems.mapNotNull { entry ->
            val m = entry as? Map<*, *> ?: return@mapNotNull null
            StockTransferItem(
                productId = m["productId"] as? String ?: "",
                productName = m["productName"] as? String ?: "",
                quantity = (m["quantity"] as? Number)?.toInt() ?: 0,
                receivedQty = (m["receivedQty"] as? Number)?.toInt(),
            )
        }
        return StockTransfer(
            id = id,
            transferNumber = data["transferNumber"] as? String ?: "",
            fromBranchId = data["fromBranchId"] as? String ?: "",
            toBranchId = data["toBranchId"] as? String ?: "",
            status = data["status"] as? String ?: "PENDING_APPROVAL",
            items = items,
            notes = data["notes"] as? String,
            requestedBy = data["requestedBy"] as? String ?: "",
            requestedByName = data["requestedByName"] as? String ?: "",
            approvedByName = data["approvedByName"] as? String,
            dispatchedByName = data["dispatchedByName"] as? String,
            receivedByName = data["receivedByName"] as? String,
            rejectedByName = data["rejectedByName"] as? String,
            rejectReason = data["rejectReason"] as? String,
            cancelledByName = data["cancelledByName"] as? String,
            cancelReason = data["cancelReason"] as? String,
            createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
        )
    }

    // ── Messaging ───────────────────────────────────────────────────────────

    /**
     * Live conversation anchored to a record (e.g. a delivery PO). Emits the
     * thread id (once created) plus its messages, re-attaching the message
     * listener whenever the underlying thread changes.
     */
    fun observeContextThread(
        storeId: String,
        contextType: String,
        contextId: String,
    ): Flow<ThreadSnapshot> = callbackFlow {
        var messagesReg: ListenerRegistration? = null
        val threadsCol = db.collection("stores").document(storeId).collection("threads")

        val threadReg = threadsCol
            .whereEqualTo("contextType", contextType)
            .whereEqualTo("contextId", contextId)
            .limit(1)
            .addSnapshotListener { snap, _ ->
                messagesReg?.remove()
                messagesReg = null
                val threadDoc = snap?.documents?.firstOrNull()
                if (threadDoc == null) {
                    trySend(ThreadSnapshot(null, emptyList()))
                    return@addSnapshotListener
                }
                val threadId = threadDoc.id
                messagesReg = threadsCol.document(threadId).collection("messages")
                    .orderBy("createdAt")
                    .addSnapshotListener { msgSnap, _ ->
                        val messages = msgSnap?.documents
                            ?.mapNotNull { parseThreadMessage(it.id, threadId, it.data ?: return@mapNotNull null) }
                            ?.filter { !it.deleted }
                            ?: emptyList()
                        trySend(ThreadSnapshot(threadId, messages))
                    }
            }

        awaitClose {
            messagesReg?.remove()
            threadReg.remove()
        }
    }

    suspend fun sendMessage(
        threadId: String?,
        contextType: String,
        contextId: String,
        title: String,
        branchId: String,
        text: String,
    ): String {
        val data = hashMapOf<String, Any?>(
            "contextType" to contextType,
            "contextId" to contextId,
            "title" to title,
            "branchId" to branchId,
            "text" to text,
        )
        threadId?.let { data["threadId"] = it }
        val result = functions.getHttpsCallable("sendMessage").call(data).await()
        val map = result.data as? Map<*, *>
        return map?.get("threadId") as? String ?: threadId ?: ""
    }

    suspend fun markThreadRead(threadId: String) {
        functions.getHttpsCallable("markThreadRead").call(mapOf("threadId" to threadId)).await()
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    fun observeNotifications(storeId: String, uid: String): Flow<List<StoreNotification>> = callbackFlow {
        val reg = db.collection("stores").document(storeId).collection("notifications")
            .whereEqualTo("recipientUid", uid)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(50)
            .addSnapshotListener { snap, _ ->
                val list = snap?.documents
                    ?.mapNotNull { parseNotification(it.id, it.data ?: return@mapNotNull null) }
                    ?: emptyList()
                trySend(list)
            }
        awaitClose { reg.remove() }
    }

    suspend fun markNotificationRead(notificationId: String) {
        functions.getHttpsCallable("markNotificationRead")
            .call(mapOf("notificationId" to notificationId)).await()
    }

    suspend fun markAllNotificationsRead() {
        functions.getHttpsCallable("markAllNotificationsRead").call(emptyMap<String, Any>()).await()
    }

    private fun parseThreadMessage(id: String, threadId: String, data: Map<String, Any?>): ThreadMessage =
        ThreadMessage(
            id = id,
            threadId = threadId,
            senderId = data["senderId"] as? String ?: "",
            senderName = data["senderName"] as? String ?: "",
            senderRole = data["senderRole"] as? String ?: "",
            text = data["text"] as? String ?: "",
            deleted = data["deleted"] as? Boolean ?: false,
            createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
        )

    private fun parseNotification(id: String, data: Map<String, Any?>): StoreNotification =
        StoreNotification(
            id = id,
            recipientUid = data["recipientUid"] as? String ?: "",
            branchId = data["branchId"] as? String,
            kind = data["kind"] as? String ?: "",
            title = data["title"] as? String ?: "",
            body = data["body"] as? String ?: "",
            link = data["link"] as? String,
            refType = data["refType"] as? String,
            refId = data["refId"] as? String,
            threadId = data["threadId"] as? String,
            read = data["read"] as? Boolean ?: false,
            actorName = data["actorName"] as? String,
            createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
        )

    private suspend fun getInventoryStock(storeId: String, branchId: String, productId: String): Int {
        val id = inventoryDocId(branchId, productId)
        val snap = db.collection("stores").document(storeId)
            .collection("branchInventory").document(id).get().await()
        return (snap.data?.get("currentStock") as? Number)?.toInt() ?: 0
    }

    private suspend fun loadCategoriesMap(storeId: String): Map<String, String> {
        val snap = db.collection("stores").document(storeId).collection("categories").get().await()
        return snap.documents.associate { doc ->
            doc.id to (doc.getString("name") ?: "")
        }
    }

    private fun inventoryDocId(branchId: String, productId: String) = "${branchId}_$productId"

    private fun parseUser(id: String, data: Map<String, Any?>): User {
        val perms = data["permissions"] as? Map<*, *>
        return User(
            id = id,
            storeId = data["storeId"] as? String ?: "",
            branchId = data["branchId"] as? String ?: "",
            fullName = data["fullName"] as? String ?: "",
            email = data["email"] as? String ?: "",
            role = UserRole.fromString(data["role"] as? String ?: "CASHIER"),
            status = EntityStatus.fromString(data["status"] as? String ?: "ACTIVE"),
            phoneNumber = data["phoneNumber"] as? String,
            permissions = perms?.let {
                CustomPermissions(
                    canVoidSale = it["canVoidSale"] as? Boolean ?: false,
                    canApproveStockAdjustment = it["canApproveStockAdjustment"] as? Boolean ?: false,
                    canViewSupplierCost = it["canViewSupplierCost"] as? Boolean ?: false,
                    canCreatePurchaseRequest = it["canCreatePurchaseRequest"] as? Boolean ?: false,
                    canChangePrice = it["canChangePrice"] as? Boolean ?: false,
                )
            },
            createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
            updatedAt = (data["updatedAt"] as? Number)?.toLong() ?: 0L,
        )
    }

    private fun parseProduct(id: String, data: Map<String, Any?>): Product = Product(
        id = id,
        storeId = data["storeId"] as? String ?: "",
        name = data["name"] as? String ?: "",
        categoryId = data["categoryId"] as? String ?: "",
        unit = data["unit"] as? String ?: "pcs",
        sellingPrice = (data["sellingPrice"] as? Number)?.toDouble() ?: 0.0,
        reorderLevel = (data["reorderLevel"] as? Number)?.toInt() ?: 0,
        criticalLevel = (data["criticalLevel"] as? Number)?.toInt() ?: 0,
        status = EntityStatus.fromString(data["status"] as? String ?: "ACTIVE"),
        barcode = data["barcode"] as? String,
        internalBarcode = data["internalBarcode"] as? String,
        sku = data["sku"] as? String,
        brand = data["brand"] as? String,
        description = data["description"] as? String,
        supplierId = data["supplierId"] as? String,
        supplierCost = (data["supplierCost"] as? Number)?.toDouble(),
        imageUrl = data["imageUrl"] as? String,
        remarks = data["remarks"] as? String,
        unitsPerPack = (data["unitsPerPack"] as? Number)?.toInt(),
        packLabel = data["packLabel"] as? String,
        createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
        updatedAt = (data["updatedAt"] as? Number)?.toLong() ?: 0L,
    )

    @Suppress("UNCHECKED_CAST")
    private fun parsePurchaseOrder(id: String, data: Map<String, Any?>): PurchaseOrder {
        val itemsRaw = data["items"] as? List<Map<String, Any?>> ?: emptyList()
        return PurchaseOrder(
            id = id,
            storeId = data["storeId"] as? String ?: "",
            branchId = data["branchId"] as? String ?: "",
            supplierId = data["supplierId"] as? String ?: "",
            poNumber = data["poNumber"] as? String ?: "",
            supplierReferenceNumber = data["supplierReferenceNumber"] as? String,
            expectedDeliveryDate = data["expectedDeliveryDate"] as? String ?: "",
            expectedCost = (data["expectedCost"] as? Number)?.toDouble(),
            notes = data["notes"] as? String,
            status = POStatus.fromString(data["status"] as? String ?: "DRAFT"),
            items = itemsRaw.map { item ->
                PurchaseOrderItem(
                    productId = item["productId"] as? String ?: "",
                    productName = item["productName"] as? String ?: "",
                    expectedQty = (item["expectedQty"] as? Number)?.toInt() ?: 0,
                    receivedQty = (item["receivedQty"] as? Number)?.toInt() ?: 0,
                    sellingPrice = (item["sellingPrice"] as? Number)?.toDouble(),
                    expectedCost = (item["expectedCost"] as? Number)?.toDouble(),
                )
            },
            createdBy = data["createdBy"] as? String ?: "",
            createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
            updatedAt = (data["updatedAt"] as? Number)?.toLong(),
        )
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseSale(id: String, data: Map<String, Any?>): Sale {
        val itemsRaw = data["items"] as? List<Map<String, Any?>> ?: emptyList()
        return Sale(
            id = id,
            storeId = data["storeId"] as? String ?: "",
            branchId = data["branchId"] as? String ?: "",
            cashierId = data["cashierId"] as? String ?: "",
            cashierName = data["cashierName"] as? String ?: "",
            items = itemsRaw.map { item ->
                SaleItem(
                    productId = item["productId"] as? String ?: "",
                    productName = item["productName"] as? String ?: "",
                    quantity = (item["quantity"] as? Number)?.toInt() ?: 0,
                    unitPrice = (item["unitPrice"] as? Number)?.toDouble() ?: 0.0,
                    discount = (item["discount"] as? Number)?.toDouble() ?: 0.0,
                    lineTotal = (item["lineTotal"] as? Number)?.toDouble() ?: 0.0,
                    promoId = item["promoId"] as? String,
                )
            },
            subtotal = (data["subtotal"] as? Number)?.toDouble() ?: 0.0,
            discount = (data["discount"] as? Number)?.toDouble() ?: 0.0,
            manualDiscount = (data["manualDiscount"] as? Number)?.toDouble() ?: 0.0,
            manualDiscountReason = data["manualDiscountReason"] as? String,
            pwdSeniorDiscountAmount = (data["pwdSeniorDiscountAmount"] as? Number)?.toDouble() ?: 0.0,
            tax = (data["tax"] as? Number)?.toDouble() ?: 0.0,
            total = (data["total"] as? Number)?.toDouble() ?: 0.0,
            paymentMethod = data["paymentMethod"] as? String ?: "CASH",
            payments = (data["payments"] as? List<*>)?.mapNotNull { entry ->
                val m = entry as? Map<*, *> ?: return@mapNotNull null
                SalePayment(
                    method = m["method"] as? String ?: "CASH",
                    amount = (m["amount"] as? Number)?.toDouble() ?: 0.0,
                    reference = m["reference"] as? String,
                )
            } ?: emptyList(),
            paymentReference = data["paymentReference"] as? String,
            amountTendered = (data["amountTendered"] as? Number)?.toDouble(),
            changeGiven = (data["changeGiven"] as? Number)?.toDouble(),
            customerEmail = data["customerEmail"] as? String,
            customerPhone = data["customerPhone"] as? String,
            status = SaleStatus.fromString(data["status"] as? String ?: "COMPLETED"),
            createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
        )
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseCreateSaleResult(data: Any?): CreateSaleResult {
        val map = data as? Map<String, Any?> ?: error("Invalid createSale response")
        val saleId = map["saleId"] as? String ?: error("Missing saleId")
        val saleMap = map["sale"] as? Map<String, Any?> ?: error("Missing sale")
        return CreateSaleResult(saleId = saleId, sale = parseSale(saleId, saleMap))
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseReceiveDeliveryResult(data: Any?): ReceiveDeliveryResult {
        val map = data as? Map<String, Any?> ?: error("Invalid receiveDelivery response")
        val receiptId = map["deliveryReceiptId"] as? String ?: ""
        val itemsRaw = map["items"] as? List<Map<String, Any?>> ?: emptyList()
        val items = itemsRaw.map { item ->
            DeliveryReceiptItem(
                productId = item["productId"] as? String ?: "",
                productName = item["productName"] as? String ?: "",
                expectedQty = (item["expectedQty"] as? Number)?.toInt() ?: 0,
                receivedQty = (item["receivedQty"] as? Number)?.toInt() ?: 0,
                damagedQty = (item["damagedQty"] as? Number)?.toInt() ?: 0,
                acceptedQty = (item["acceptedQty"] as? Number)?.toInt() ?: 0,
                missingQty = (item["missingQty"] as? Number)?.toInt() ?: 0,
                expiryDate = item["expiryDate"] as? String,
                remarks = item["remarks"] as? String,
            )
        }
        return ReceiveDeliveryResult(deliveryReceiptId = receiptId, items = items)
    }
}
