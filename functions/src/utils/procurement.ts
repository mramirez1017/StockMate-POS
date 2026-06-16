import { ProcurementEventType, User, UserRole } from "@stockmate/types";
import { collection, now, stripUndefinedDeep } from "./firestore";

export interface ProcurementEventInput {
  storeId: string;
  branchId: string;
  type: ProcurementEventType;
  message: string;
  poId?: string;
  poNumber?: string;
  requestId?: string;
  actor: Pick<User, "id" | "fullName" | "role">;
  meta?: Record<string, unknown>;
}

/**
 * Append an immutable event to the procurement timeline. Best-effort — callers
 * should wrap in try/catch so logging never breaks the core write.
 */
export async function logProcurementEvent(input: ProcurementEventInput): Promise<void> {
  const ref = collection(input.storeId, "procurementEvents").doc();
  await ref.set(
    stripUndefinedDeep({
      storeId: input.storeId,
      branchId: input.branchId,
      type: input.type,
      message: input.message,
      poId: input.poId,
      poNumber: input.poNumber,
      requestId: input.requestId,
      actorId: input.actor.id,
      actorName: input.actor.fullName,
      actorRole: input.actor.role as UserRole,
      meta: input.meta,
      createdAt: now(),
    }),
  );
}
