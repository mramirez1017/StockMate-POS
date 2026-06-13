package com.stockmate.pos.data.models

enum class UserRole {
    OWNER, ADMIN, STORE_MANAGER, CASHIER;

    companion object {
        fun fromString(value: String): UserRole =
            entries.find { it.name == value } ?: CASHIER
    }
}

enum class EntityStatus {
    ACTIVE, INACTIVE;

    companion object {
        fun fromString(value: String): EntityStatus =
            entries.find { it.name == value } ?: ACTIVE
    }
}

enum class POStatus {
    DRAFT, ORDERED, IN_TRANSIT, PARTIALLY_RECEIVED, RECEIVED, CANCELLED;

    companion object {
        fun fromString(value: String): POStatus =
            entries.find { it.name == value } ?: DRAFT
    }
}

enum class DisposalReason(val label: String) {
    EXPIRED("Expired"),
    DAMAGED("Damaged"),
    SPOILED("Spoiled"),
    LOST("Lost"),
    RETURNED_TO_SUPPLIER("Returned to Supplier"),
    DISPOSED("Disposed"),
    OTHER("Other");

    companion object {
        fun fromString(value: String): DisposalReason =
            entries.find { it.name == value } ?: OTHER
    }
}

enum class SaleStatus {
    COMPLETED, VOIDED, REFUNDED;

    companion object {
        fun fromString(value: String): SaleStatus =
            entries.find { it.name == value } ?: COMPLETED
    }
}

enum class PurchaseRequestStatus {
    PENDING, APPROVED, ORDERED, REJECTED;

    companion object {
        fun fromString(value: String): PurchaseRequestStatus =
            entries.find { it.name == value } ?: PENDING
    }
}
