import { collection, now, stripUndefinedDeep } from "../utils/firestore";
import { AuditLog } from "@stockmate/types";

export async function createAuditLogEntry(params: {
  storeId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  performedBy: string;
  performedByName?: string;
}): Promise<string> {
  const ref = collection(params.storeId, "auditLogs").doc();
  const log = stripUndefinedDeep({
    storeId: params.storeId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    previousValue: params.previousValue,
    newValue: params.newValue,
    performedBy: params.performedBy,
    performedByName: params.performedByName,
    createdAt: now(),
  }) as Omit<AuditLog, "id">;
  await ref.set(log);
  return ref.id;
}
