import { NotificationKind, User, UserRole } from "@stockmate/types";
import { collection, db, now, stripUndefinedDeep } from "./firestore";

export interface NotifyInput {
  storeId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string;
  refType?: string;
  refId?: string;
  threadId?: string;
  branchId?: string;
  actorId?: string;
  actorName?: string;
  /** Explicit recipient uids. */
  recipientUids?: string[];
  /** Add every active store admin/owner. */
  toAdmins?: boolean;
  /** Add every active user assigned to this branch. */
  toBranch?: string;
  /** Never notify this uid (typically the actor who triggered the event). */
  excludeUid?: string;
}

function normalizeRole(role: UserRole | "OWNER"): UserRole {
  return role === "OWNER" ? "ADMIN" : role;
}

async function listActiveStoreUsers(storeId: string): Promise<User[]> {
  const snap = await collection(storeId, "users").where("status", "==", "ACTIVE").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as User);
}

export async function resolveRecipientUids(input: NotifyInput): Promise<string[]> {
  const recipients = new Set<string>(input.recipientUids ?? []);

  if (input.toAdmins || input.toBranch) {
    const users = await listActiveStoreUsers(input.storeId);
    for (const u of users) {
      const role = normalizeRole(u.role as UserRole | "OWNER");
      if (input.toAdmins && role === "ADMIN") recipients.add(u.id);
      if (input.toBranch && u.branchId && u.branchId === input.toBranch) recipients.add(u.id);
    }
  }

  if (input.excludeUid) recipients.delete(input.excludeUid);
  return Array.from(recipients);
}

/**
 * Fan out one notification document per recipient. Best-effort — callers should
 * wrap this in try/catch so a notification failure never breaks the core write.
 */
export async function createNotifications(input: NotifyInput): Promise<void> {
  const recipients = await resolveRecipientUids(input);
  if (recipients.length === 0) return;

  const batch = db.batch();
  const ts = now();
  for (const uid of recipients) {
    const ref = collection(input.storeId, "notifications").doc();
    batch.set(
      ref,
      stripUndefinedDeep({
        storeId: input.storeId,
        recipientUid: uid,
        branchId: input.branchId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link,
        refType: input.refType,
        refId: input.refId,
        threadId: input.threadId,
        read: false,
        actorId: input.actorId,
        actorName: input.actorName,
        createdAt: ts,
      }),
    );
  }
  await batch.commit();
}
