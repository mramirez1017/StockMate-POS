import { onCall } from "firebase-functions/v2/https";
import { PermissionRequest, RequestablePermission, UserRole } from "@stockmate/types";
import { resolveAuth, requireAdmin, requirePosAccess, isStoreAdminRole } from "../utils/auth";
import { collection, db, now, stripUndefined } from "../utils/firestore";
import { invalidArgument, notFound, failedPrecondition } from "../utils/errors";
import { createNotifications } from "../utils/notify";
import { createAuditLogEntry } from "../audit";
import { emailDocId, normalizeEmail } from "../utils/email";

const REQUESTABLE: RequestablePermission[] = [
  "canApproveStockAdjustment",
  "canViewSupplierCost",
  "canCreatePurchaseRequest",
  "canChangePrice",
];

const PERMISSION_LABELS: Record<RequestablePermission, string> = {
  canApproveStockAdjustment: "Approve Stock Adjustment",
  canViewSupplierCost: "View Supplier Cost",
  canCreatePurchaseRequest: "Create Purchase Request",
  canChangePrice: "Change Price",
};

function assertRequestable(permission: unknown): asserts permission is RequestablePermission {
  if (typeof permission !== "string" || !REQUESTABLE.includes(permission as RequestablePermission)) {
    throw invalidArgument("A valid requestable permission is required");
  }
}

/** Branch staff ask for one of the elevated permissions; admins review it. */
export const createPermissionRequest = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requirePosAccess(user);
  if (isStoreAdminRole(user.role as UserRole | "OWNER")) {
    throw failedPrecondition("Admins already hold every permission");
  }

  const { permission, reason } = request.data as { permission: RequestablePermission; reason?: string };
  assertRequestable(permission);

  if (user.permissions?.[permission]) {
    throw failedPrecondition("You already have this permission");
  }

  const existing = await collection(storeId, "permissionRequests")
    .where("requestedBy", "==", uid)
    .where("permission", "==", permission)
    .where("status", "==", "PENDING")
    .get();
  if (!existing.empty) {
    throw failedPrecondition("You already have a pending request for this permission");
  }

  const ref = collection(storeId, "permissionRequests").doc();
  const record: Omit<PermissionRequest, "id"> = {
    storeId,
    branchId: user.branchId,
    permission,
    reason: typeof reason === "string" && reason.trim() ? reason.trim() : undefined,
    status: "PENDING",
    requestedBy: uid,
    requestedByName: user.fullName,
    createdAt: now(),
    updatedAt: now(),
  };
  await ref.set(stripUndefined(record));

  try {
    await createNotifications({
      storeId,
      kind: "PERMISSION_REQUEST",
      title: `Access request · ${PERMISSION_LABELS[permission]}`,
      body: `${user.fullName} requested "${PERMISSION_LABELS[permission]}" access.`,
      link: "/activity",
      refType: "PERMISSION_REQUEST",
      refId: ref.id,
      branchId: user.branchId,
      actorId: uid,
      actorName: user.fullName,
      toAdmins: true,
      excludeUid: uid,
    });
  } catch (err) {
    console.error("createNotifications failed after createPermissionRequest", err);
  }

  return { permissionRequestId: ref.id, status: "PENDING" };
});

/** Set the permission flag on the user profile (and their registration record). */
async function grantPermission(storeId: string, targetUid: string, permission: RequestablePermission) {
  const userRef = collection(storeId, "users").doc(targetUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw notFound("User profile not found");
  const target = userSnap.data() as { email?: string };

  const ts = now();
  const batch = db.batch();
  batch.update(userRef, { [`permissions.${permission}`]: true, updatedAt: ts });

  if (target.email) {
    const regRef = db.collection("registeredEmails").doc(emailDocId(normalizeEmail(target.email)));
    const regSnap = await regRef.get();
    if (regSnap.exists) {
      batch.update(regRef, { [`permissions.${permission}`]: true, updatedAt: ts });
    }
  }

  await batch.commit();
}

async function loadPendingRequest(storeId: string, requestId: string): Promise<PermissionRequest> {
  const ref = collection(storeId, "permissionRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Permission request not found");
  const req = { id: snap.id, ...snap.data() } as PermissionRequest;
  if (req.status !== "PENDING") throw failedPrecondition(`Request is already ${req.status}`);
  return req;
}

export const approvePermissionRequest = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireAdmin(user);

  const { requestId, note } = request.data as { requestId: string; note?: string };
  if (!requestId) throw invalidArgument("requestId is required");

  const req = await loadPendingRequest(storeId, requestId);

  await grantPermission(storeId, req.requestedBy, req.permission);

  await collection(storeId, "permissionRequests").doc(requestId).update(
    stripUndefined({
      status: "APPROVED",
      reviewedBy: uid,
      reviewedByName: user.fullName,
      reviewNote: typeof note === "string" && note.trim() ? note.trim() : undefined,
      reviewedAt: now(),
      updatedAt: now(),
    }),
  );

  await createAuditLogEntry({
    storeId,
    action: "PERMISSION_REQUEST_APPROVED",
    entityType: "permissionRequest",
    entityId: requestId,
    newValue: { permission: req.permission, grantedTo: req.requestedBy },
    performedBy: uid,
    performedByName: user.fullName,
  });

  if (req.requestedBy !== uid) {
    try {
      await createNotifications({
        storeId,
        kind: "PERMISSION_REQUEST_RESOLVED",
        title: `Access granted · ${PERMISSION_LABELS[req.permission]}`,
        body: `${user.fullName} approved your "${PERMISSION_LABELS[req.permission]}" access.`,
        link: "/activity",
        refType: "PERMISSION_REQUEST",
        refId: requestId,
        branchId: req.branchId,
        actorId: uid,
        actorName: user.fullName,
        recipientUids: [req.requestedBy],
      });
    } catch (err) {
      console.error("createNotifications failed after approvePermissionRequest", err);
    }
  }

  return { requestId, status: "APPROVED" };
});

export const rejectPermissionRequest = onCall(async (request) => {
  const { storeId, user, uid } = await resolveAuth(request);
  requireAdmin(user);

  const { requestId, note } = request.data as { requestId: string; note?: string };
  if (!requestId) throw invalidArgument("requestId is required");

  const req = await loadPendingRequest(storeId, requestId);

  await collection(storeId, "permissionRequests").doc(requestId).update(
    stripUndefined({
      status: "REJECTED",
      reviewedBy: uid,
      reviewedByName: user.fullName,
      reviewNote: typeof note === "string" && note.trim() ? note.trim() : undefined,
      reviewedAt: now(),
      updatedAt: now(),
    }),
  );

  await createAuditLogEntry({
    storeId,
    action: "PERMISSION_REQUEST_REJECTED",
    entityType: "permissionRequest",
    entityId: requestId,
    newValue: { permission: req.permission, note },
    performedBy: uid,
    performedByName: user.fullName,
  });

  if (req.requestedBy !== uid) {
    try {
      await createNotifications({
        storeId,
        kind: "PERMISSION_REQUEST_RESOLVED",
        title: `Access declined · ${PERMISSION_LABELS[req.permission]}`,
        body: `${user.fullName} declined your "${PERMISSION_LABELS[req.permission]}" request${
          note ? ` — ${note}` : ""
        }.`,
        link: "/activity",
        refType: "PERMISSION_REQUEST",
        refId: requestId,
        branchId: req.branchId,
        actorId: uid,
        actorName: user.fullName,
        recipientUids: [req.requestedBy],
      });
    } catch (err) {
      console.error("createNotifications failed after rejectPermissionRequest", err);
    }
  }

  return { requestId, status: "REJECTED" };
});
