import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";
import {
  SendMessageInput,
  Thread,
  ThreadContextType,
  ThreadMessage,
  UserRole,
} from "@stockmate/types";
import { resolveAuth, isStoreAdminRole, assertBranchAccess } from "../utils/auth";
import { collection, db, now, stripUndefinedDeep } from "../utils/firestore";
import { invalidArgument, notFound, permissionDenied } from "../utils/errors";
import { createNotifications } from "../utils/notify";

const MAX_MESSAGE_LENGTH = 2000;

function normalizeRole(role: UserRole | "OWNER"): UserRole {
  return role === "OWNER" ? "ADMIN" : role;
}

function defaultTitle(contextType: ThreadContextType, contextId: string): string {
  switch (contextType) {
    case "PURCHASE_ORDER":
      return "Purchase order";
    case "DELIVERY":
      return "Delivery";
    case "PURCHASE_REQUEST":
      return "Purchase request";
    case "STOCK_ADJUSTMENT":
      return "Stock adjustment";
    case "SALE_VOID":
      return "Void request";
    default:
      return "Conversation";
  }
}

/** Web deep-link for a thread's anchor record. */
function threadLink(contextType: ThreadContextType, contextId: string): string {
  if ((contextType === "PURCHASE_ORDER" || contextType === "DELIVERY") && contextId) {
    return `/deliveries/${contextId}`;
  }
  return "/activity";
}

interface ThreadDoc extends Thread {
  ref: FirebaseFirestore.DocumentReference;
}

async function getOrCreateThread(
  storeId: string,
  uid: string,
  data: SendMessageInput,
): Promise<ThreadDoc> {
  const threadsCol = collection(storeId, "threads");

  if (data.threadId) {
    const ref = threadsCol.doc(data.threadId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Conversation not found");
    return { id: snap.id, ...(snap.data() as Omit<Thread, "id">), ref };
  }

  const contextType: ThreadContextType = data.contextType ?? "GENERAL";
  const branchId = (data.branchId ?? "").trim();
  // General channels dedupe per-branch (or store-wide when no branch supplied).
  const contextId =
    (data.contextId ?? "").trim() || (contextType === "GENERAL" ? branchId || "store" : "");

  if (contextType !== "GENERAL" && !contextId) {
    throw invalidArgument("contextId is required for anchored conversations");
  }

  const existing = await threadsCol
    .where("contextType", "==", contextType)
    .where("contextId", "==", contextId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    return { id: doc.id, ...(doc.data() as Omit<Thread, "id">), ref: doc.ref };
  }

  const ref = threadsCol.doc();
  const thread: Omit<Thread, "id"> = {
    storeId,
    branchId,
    contextType,
    contextId,
    title: (data.title ?? "").trim() || defaultTitle(contextType, contextId),
    participantUids: [uid],
    messageCount: 0,
    reads: {},
    status: "OPEN",
    createdBy: uid,
    createdAt: now(),
    updatedAt: now(),
  };
  await ref.set(stripUndefinedDeep(thread));
  return { id: ref.id, ...thread, ref };
}

export const sendMessage = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);

  const data = request.data as SendMessageInput;
  const text = (data?.text ?? "").trim();
  if (!text) throw invalidArgument("Message text is required");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw invalidArgument(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }

  const thread = await getOrCreateThread(storeId, uid, data);

  // Branch staff may only post in their branch's conversations; admins post anywhere.
  if (thread.branchId) assertBranchAccess(user, thread.branchId);

  const role = normalizeRole(user.role as UserRole | "OWNER");
  const messageRef = thread.ref.collection("messages").doc();
  const ts = now();

  const message: Omit<ThreadMessage, "id"> = {
    threadId: thread.id,
    storeId,
    senderId: uid,
    senderName: user.fullName,
    senderRole: role,
    text,
    createdAt: ts,
  };

  await db.runTransaction(async (tx) => {
    tx.set(messageRef, stripUndefinedDeep(message));
    tx.update(thread.ref, {
      lastMessage: text.slice(0, 140),
      lastSenderId: uid,
      lastSenderName: user.fullName,
      lastSenderRole: role,
      lastMessageAt: ts,
      messageCount: admin.firestore.FieldValue.increment(1),
      participantUids: admin.firestore.FieldValue.arrayUnion(uid),
      [`reads.${uid}`]: ts,
      updatedAt: ts,
    });
  });

  try {
    await createNotifications({
      storeId,
      kind: "NEW_MESSAGE",
      title: `New message · ${thread.title}`,
      body: `${user.fullName}: ${text.slice(0, 120)}`,
      link: threadLink(thread.contextType, thread.contextId),
      refType: thread.contextType,
      refId: thread.contextId,
      threadId: thread.id,
      branchId: thread.branchId || undefined,
      actorId: uid,
      actorName: user.fullName,
      recipientUids: thread.participantUids,
      toAdmins: true,
      toBranch: thread.branchId || undefined,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after sendMessage", err);
  }

  return { threadId: thread.id, messageId: messageRef.id };
});

export const markThreadRead = onCall(async (request) => {
  const { storeId, uid } = await resolveAuth(request);
  const { threadId } = request.data as { threadId: string };
  if (!threadId) throw invalidArgument("threadId is required");

  const ref = collection(storeId, "threads").doc(threadId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Conversation not found");

  await ref.update({ [`reads.${uid}`]: now() });
  return { success: true };
});

export const unsendMessage = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  const { threadId, messageId } = request.data as { threadId: string; messageId: string };
  if (!threadId || !messageId) throw invalidArgument("threadId and messageId are required");

  const threadRef = collection(storeId, "threads").doc(threadId);
  const messageRef = threadRef.collection("messages").doc(messageId);
  const snap = await messageRef.get();
  if (!snap.exists) throw notFound("Message not found");

  const message = snap.data() as ThreadMessage;
  const isAdmin = isStoreAdminRole(user.role as UserRole | "OWNER");
  if (message.senderId !== uid && !isAdmin) {
    throw permissionDenied("You can only unsend your own messages");
  }

  await messageRef.update({ deleted: true, text: "" });
  return { success: true };
});

export const markNotificationRead = onCall(async (request) => {
  const { storeId, uid } = await resolveAuth(request);
  const { notificationId } = request.data as { notificationId: string };
  if (!notificationId) throw invalidArgument("notificationId is required");

  const ref = collection(storeId, "notifications").doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Notification not found");
  if (snap.data()?.recipientUid !== uid) throw permissionDenied();

  await ref.update({ read: true });
  return { success: true };
});

export const markAllNotificationsRead = onCall(async (request) => {
  const { storeId, uid } = await resolveAuth(request);

  const snap = await collection(storeId, "notifications")
    .where("recipientUid", "==", uid)
    .where("read", "==", false)
    .get();

  if (snap.empty) return { updated: 0 };

  // Firestore batches cap at 500 writes.
  let updated = 0;
  const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
  for (let i = 0; i < snap.docs.length; i += 450) {
    chunks.push(snap.docs.slice(i, i + 450));
  }
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const doc of chunk) {
      batch.update(doc.ref, { read: true });
      updated += 1;
    }
    await batch.commit();
  }
  return { updated };
});
