package com.stockmate.pos.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.stockmate.pos.data.models.*
import com.stockmate.pos.util.NumberInput
import kotlinx.coroutines.tasks.await

class FirebaseRepository {

    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()
    private val functions = FirebaseFunctions.getInstance()

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
        val indexSnap = db.collection("userStoreIndex").document(uid).get().await()
        if (!indexSnap.exists()) error("User not registered in any store")
        val storeId = indexSnap.getString("storeId") ?: error("Missing storeId")
        val userSnap = db.collection("stores").document(storeId)
            .collection("users").document(uid).get().await()
        if (!userSnap.exists()) error("User profile not found")
        parseUser(userSnap.id, userSnap.data ?: emptyMap()).also {
            if (it.status != EntityStatus.ACTIVE) error("Account is inactive")
            if (!it.canAccessPos) error("Role not allowed on mobile")
            if (it.branchId.isBlank()) error("No branch assigned")
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
        val result = functions.getHttpsCallable("createSale").call(data).await()
        return parseCreateSaleResult(result.data)
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
            pwdSeniorDiscountAmount = (data["pwdSeniorDiscountAmount"] as? Number)?.toDouble() ?: 0.0,
            tax = (data["tax"] as? Number)?.toDouble() ?: 0.0,
            total = (data["total"] as? Number)?.toDouble() ?: 0.0,
            paymentMethod = data["paymentMethod"] as? String ?: "CASH",
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
