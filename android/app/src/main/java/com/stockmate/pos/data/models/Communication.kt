package com.stockmate.pos.data.models

/** A single chat message inside a thread. */
data class ThreadMessage(
    val id: String,
    val threadId: String,
    val senderId: String,
    val senderName: String,
    val senderRole: String,
    val text: String,
    val deleted: Boolean = false,
    val createdAt: Long,
)

/** Combined live view of a conversation: its id (if created yet) and messages. */
data class ThreadSnapshot(
    val threadId: String?,
    val messages: List<ThreadMessage>,
)

/** Per-recipient in-app notification (delivery events, approvals, chat replies). */
data class StoreNotification(
    val id: String,
    val recipientUid: String,
    val branchId: String?,
    val kind: String,
    val title: String,
    val body: String,
    val link: String?,
    val refType: String?,
    val refId: String?,
    val threadId: String?,
    val read: Boolean,
    val actorName: String?,
    val createdAt: Long,
)
