package com.stockmate.pos.data.models

data class CustomPermissions(
    val canVoidSale: Boolean = false,
    val canApproveStockAdjustment: Boolean = false,
    val canViewSupplierCost: Boolean = false,
    val canCreatePurchaseRequest: Boolean = false,
    val canChangePrice: Boolean = false,
)

data class User(
    val id: String = "",
    val storeId: String = "",
    val branchId: String = "",
    val fullName: String = "",
    val email: String = "",
    val role: UserRole = UserRole.CASHIER,
    val status: EntityStatus = EntityStatus.ACTIVE,
    val phoneNumber: String? = null,
    val permissions: CustomPermissions? = null,
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
) {
    val canAccessPos: Boolean
        get() = role in listOf(UserRole.OWNER, UserRole.ADMIN, UserRole.STORE_MANAGER, UserRole.CASHIER)

    val canCreatePurchaseRequest: Boolean
        get() = role in listOf(UserRole.OWNER, UserRole.ADMIN, UserRole.STORE_MANAGER) ||
            permissions?.canCreatePurchaseRequest == true

    val isStoreAdmin: Boolean
        get() = role == UserRole.OWNER || role == UserRole.ADMIN

    val isManagerOrAbove: Boolean
        get() = isStoreAdmin || role == UserRole.STORE_MANAGER

    val canChangePrice: Boolean
        get() = isStoreAdmin || permissions?.canChangePrice == true
}
