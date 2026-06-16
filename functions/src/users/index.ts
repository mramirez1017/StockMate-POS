import { onCall } from "firebase-functions/v2/https";
import { RegisteredEmail, UserRole, CustomPermissions } from "@stockmate/types";
import { db, now, stripUndefined } from "../utils/firestore";
import { emailDocId, normalizeEmail } from "../utils/email";
import { invalidArgument, permissionDenied, notFound, failedPrecondition } from "../utils/errors";
import { resolveAuthOptional, isPlatformOwnerUid, isStoreAdminRole } from "../utils/auth";
import { createAuditLogEntry } from "../audit";

const BRANCH_STAFF_ROLES: UserRole[] = ["STORE_MANAGER", "CASHIER"];
const PLATFORM_OWNER_ROLES: UserRole[] = ["PLATFORM_OWNER", "ADMIN"];
const PERMISSION_KEYS: (keyof CustomPermissions)[] = [
  "canVoidSale",
  "canApproveStockAdjustment",
  "canViewSupplierCost",
  "canCreatePurchaseRequest",
  "canChangePrice",
];

export const registerUserEmail = onCall(async (request) => {
  if (!request.auth?.uid) throw permissionDenied();

  const callerUid = request.auth.uid;
  const data = request.data as {
    email: string;
    fullName: string;
    role: UserRole;
    storeId?: string;
    branchId?: string;
    phoneNumber?: string;
    permissions?: CustomPermissions;
  };

  if (!data.email || !data.fullName || !data.role) {
    throw invalidArgument("email, fullName, and role are required");
  }

  const email = normalizeEmail(data.email);
  const emailKey = emailDocId(email);

  const platformOwner = await isPlatformOwnerUid(callerUid);
  let callerStoreId: string | null = null;

  if (!platformOwner) {
    const auth = await resolveAuthOptional(callerUid);
    if (!auth || !isStoreAdminRole(auth.user.role as UserRole | "OWNER")) {
      throw permissionDenied("Only platform owner or store admin can register users");
    }
    callerStoreId = auth.storeId;

    if (!BRANCH_STAFF_ROLES.includes(data.role)) {
      throw permissionDenied("Store admin can only register branch managers and cashiers");
    }
    if (data.storeId && data.storeId !== callerStoreId) {
      throw permissionDenied("Cannot register users for another store");
    }
    if (!data.branchId) {
      throw invalidArgument("branchId is required for branch staff");
    }
  } else {
    if (!PLATFORM_OWNER_ROLES.includes(data.role)) {
      throw permissionDenied("Platform owner can only register platform owners and store admins");
    }
    if (data.role === "ADMIN") {
      if (!data.storeId) {
        throw invalidArgument("storeId is required for store admin");
      }
      if (data.branchId) {
        throw invalidArgument("Store admin is assigned at store level, not branch");
      }
    }
  }

  const existing = await db.collection("registeredEmails").doc(emailKey).get();
  if (existing.exists && existing.data()?.claimed) {
    throw failedPrecondition("This email is already registered and claimed");
  }

  const storeId = platformOwner ? data.storeId : callerStoreId!;
  const record = stripUndefined({
    email,
    fullName: data.fullName,
    role: data.role,
    storeId: data.role === "PLATFORM_OWNER" ? undefined : storeId ?? data.storeId,
    branchId:
      data.role === "PLATFORM_OWNER" || data.role === "ADMIN" ? undefined : data.branchId,
    status: "ACTIVE",
    claimed: false,
    permissions: data.permissions,
    phoneNumber: data.phoneNumber,
    createdBy: callerUid,
    createdAt: now(),
    updatedAt: now(),
  });

  await db.collection("registeredEmails").doc(emailKey).set(record);
  return { emailKey, email };
});

export const updateUserRole = onCall(async (request) => {
  if (!request.auth?.uid) throw permissionDenied();
  const callerUid = request.auth.uid;

  const { uid, role, branchId } = request.data as {
    uid: string;
    role: UserRole;
    branchId?: string;
  };
  if (!uid || !role) throw invalidArgument("uid and role are required");
  if (uid === callerUid) throw failedPrecondition("You cannot change your own role");

  const idxSnap = await db.collection("userStoreIndex").doc(uid).get();
  if (!idxSnap.exists) throw notFound("User not found");
  const idx = idxSnap.data() as { storeId?: string; isPlatformOwner?: boolean };
  if (idx.isPlatformOwner) throw permissionDenied("Cannot change a platform owner's role");
  if (!idx.storeId) throw failedPrecondition("User is not assigned to a store");
  const storeId = idx.storeId;

  const platformOwner = await isPlatformOwnerUid(callerUid);
  if (!platformOwner) {
    const auth = await resolveAuthOptional(callerUid);
    if (!auth || !isStoreAdminRole(auth.user.role as UserRole | "OWNER") || auth.storeId !== storeId) {
      throw permissionDenied("Only the store admin or platform owner can change roles");
    }
    if (!BRANCH_STAFF_ROLES.includes(role)) {
      throw permissionDenied("Store admin can only assign branch manager or cashier roles");
    }
  } else if (![...BRANCH_STAFF_ROLES, "ADMIN"].includes(role)) {
    throw permissionDenied("Unsupported role for this user");
  }

  const userRef = db.collection("stores").doc(storeId).collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw notFound("User profile not found");
  const target = userSnap.data() as { role: UserRole; email?: string; branchId?: string };

  let nextBranchId: string;
  if (BRANCH_STAFF_ROLES.includes(role)) {
    nextBranchId = branchId ?? target.branchId ?? "";
    if (!nextBranchId) throw invalidArgument("branchId is required for branch staff");
  } else {
    nextBranchId = ""; // Store admin is assigned at store level, not a branch
  }

  const ts = now();
  const batch = db.batch();
  batch.update(userRef, { role, branchId: nextBranchId, updatedAt: ts });
  batch.update(db.collection("userStoreIndex").doc(uid), { role });

  if (target.email) {
    const emailKey = emailDocId(normalizeEmail(target.email));
    const regRef = db.collection("registeredEmails").doc(emailKey);
    const regSnap = await regRef.get();
    if (regSnap.exists) {
      batch.update(
        regRef,
        stripUndefined({
          role,
          branchId: BRANCH_STAFF_ROLES.includes(role) ? nextBranchId : undefined,
          updatedAt: ts,
        }),
      );
    }
  }

  await batch.commit();
  return { success: true, role, branchId: nextBranchId };
});

/** Admin / platform owner grants or revokes a branch-staff member's custom permissions. */
export const setUserPermissions = onCall(async (request) => {
  if (!request.auth?.uid) throw permissionDenied();
  const callerUid = request.auth.uid;

  const { uid, permissions } = request.data as { uid: string; permissions: CustomPermissions };
  if (!uid || permissions == null || typeof permissions !== "object") {
    throw invalidArgument("uid and permissions are required");
  }
  if (uid === callerUid) throw failedPrecondition("You cannot change your own permissions");

  const idxSnap = await db.collection("userStoreIndex").doc(uid).get();
  if (!idxSnap.exists) throw notFound("User not found");
  const idx = idxSnap.data() as { storeId?: string; isPlatformOwner?: boolean };
  if (idx.isPlatformOwner) throw permissionDenied("Cannot change a platform owner's permissions");
  if (!idx.storeId) throw failedPrecondition("User is not assigned to a store");
  const storeId = idx.storeId;

  const platformOwner = await isPlatformOwnerUid(callerUid);
  let callerName = "Platform Owner";
  if (!platformOwner) {
    const auth = await resolveAuthOptional(callerUid);
    if (!auth || !isStoreAdminRole(auth.user.role as UserRole | "OWNER") || auth.storeId !== storeId) {
      throw permissionDenied("Only the store admin or platform owner can change permissions");
    }
    callerName = auth.user.fullName;
  } else {
    const poSnap = await db.collection("platformOwners").doc(callerUid).get();
    callerName = (poSnap.data()?.fullName as string) ?? "Platform Owner";
  }

  const userRef = db.collection("stores").doc(storeId).collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw notFound("User profile not found");
  const target = userSnap.data() as { role: UserRole; email?: string };
  if (!BRANCH_STAFF_ROLES.includes(target.role)) {
    throw failedPrecondition("Only branch managers and cashiers have custom permissions");
  }

  // Only persist known boolean flags — ignore anything unexpected in the payload.
  const clean: Record<string, boolean> = {};
  for (const key of PERMISSION_KEYS) {
    clean[key] = permissions[key] === true;
  }

  const ts = now();
  const batch = db.batch();
  batch.update(userRef, { permissions: clean, updatedAt: ts });

  if (target.email) {
    const regRef = db.collection("registeredEmails").doc(emailDocId(normalizeEmail(target.email)));
    const regSnap = await regRef.get();
    if (regSnap.exists) {
      batch.update(regRef, { permissions: clean, updatedAt: ts });
    }
  }

  await batch.commit();

  await createAuditLogEntry({
    storeId,
    action: "USER_PERMISSIONS_UPDATED",
    entityType: "user",
    entityId: uid,
    newValue: clean,
    performedBy: callerUid,
    performedByName: callerName,
  });

  return { success: true, permissions: clean };
});

export const claimAccount = onCall(async (request) => {
  if (!request.auth?.uid || !request.auth.token.email) {
    throw permissionDenied("Authentication required");
  }

  const uid = request.auth.uid;
  const email = normalizeEmail(request.auth.token.email);
  const emailKey = emailDocId(email);

  const indexSnap = await db.collection("userStoreIndex").doc(uid).get();
  const platformSnap = await db.collection("platformOwners").doc(uid).get();
  if (platformSnap.exists) {
    return { alreadyClaimed: true };
  }

  const regSnap = await db.collection("registeredEmails").doc(emailKey).get();
  if (!regSnap.exists) {
    throw permissionDenied(
      "Your email is not registered. Contact the platform administrator to be added."
    );
  }

  const reg = { id: regSnap.id, ...regSnap.data() } as RegisteredEmail;

  if (reg.claimed && reg.claimedUid !== uid) {
    throw failedPrecondition("This email has already been used to sign in");
  }
  if (reg.status !== "ACTIVE") {
    throw permissionDenied("Your account registration is inactive");
  }
  if (reg.email !== email) {
    throw permissionDenied("Email mismatch");
  }

  if (indexSnap.exists) {
    const idx = indexSnap.data() as { isPlatformOwner?: boolean; storeId?: string };
    if (idx.isPlatformOwner) {
      return { alreadyClaimed: true };
    }
    if (reg.role !== "PLATFORM_OWNER") {
      return { alreadyClaimed: true };
    }
    // Legacy store bootstrap index — upgrade to platform owner below
  }

  const batch = db.batch();
  const ts = now();

  if (reg.role === "PLATFORM_OWNER") {
    batch.set(db.collection("platformOwners").doc(uid), {
      email,
      fullName: reg.fullName,
      createdAt: ts,
    });
    batch.set(db.collection("userStoreIndex").doc(uid), {
      role: "PLATFORM_OWNER",
      isPlatformOwner: true,
      createdAt: ts,
    });
  } else {
    if (!reg.storeId) {
      throw failedPrecondition("Registration is missing store");
    }
    if (BRANCH_STAFF_ROLES.includes(reg.role) && !reg.branchId) {
      throw failedPrecondition("Registration is missing branch");
    }

    const user = stripUndefined({
      storeId: reg.storeId,
      branchId: reg.branchId ?? "",
      fullName: reg.fullName,
      email,
      role: reg.role,
      status: "ACTIVE",
      permissions: reg.permissions,
      createdAt: ts,
      updatedAt: ts,
    });

    batch.set(db.collection("userStoreIndex").doc(uid), {
      storeId: reg.storeId,
      role: reg.role,
      createdAt: ts,
    });
    batch.set(db.collection("stores").doc(reg.storeId).collection("users").doc(uid), user);
  }

  batch.update(db.collection("registeredEmails").doc(emailKey), {
    claimed: true,
    claimedUid: uid,
    claimedAt: ts,
    updatedAt: ts,
  });

  await batch.commit();

  return {
    claimed: true,
    role: reg.role,
    storeId: reg.storeId ?? null,
  };
});

export const deactivateRegisteredEmail = onCall(async (request) => {
  if (!request.auth?.uid) throw permissionDenied();

  const { emailKey } = request.data as { emailKey: string };
  if (!emailKey) throw invalidArgument("emailKey is required");

  const regSnap = await db.collection("registeredEmails").doc(emailKey).get();
  if (!regSnap.exists) throw notFound("Registration not found");

  const reg = regSnap.data() as RegisteredEmail;
  const platformOwner = await isPlatformOwnerUid(request.auth.uid);

  if (!platformOwner) {
    const auth = await resolveAuthOptional(request.auth.uid);
    if (!auth || !isStoreAdminRole(auth.user.role as UserRole | "OWNER") || auth.storeId !== reg.storeId) {
      throw permissionDenied();
    }
    if (reg.role === "PLATFORM_OWNER" || reg.role === "ADMIN") {
      throw permissionDenied("Store admin cannot deactivate platform or store admin registrations");
    }
  }

  await db.collection("registeredEmails").doc(emailKey).update({
    status: "INACTIVE",
    updatedAt: now(),
  });

  if (reg.claimedUid && reg.storeId) {
    await db.collection("stores").doc(reg.storeId).collection("users").doc(reg.claimedUid).update({
      status: "INACTIVE",
      updatedAt: now(),
    });
  }

  return { success: true };
});

/** Fix session when registered as platform owner but profile docs are incomplete */
export const repairPlatformOwnerSession = onCall(async (request) => {
  if (!request.auth?.uid || !request.auth.token.email) {
    throw permissionDenied("Authentication required");
  }

  const uid = request.auth.uid;
  const email = normalizeEmail(request.auth.token.email);
  const emailKey = emailDocId(email);

  const regSnap = await db.collection("registeredEmails").doc(emailKey).get();
  if (!regSnap.exists) throw permissionDenied("Not registered as platform owner");

  const reg = regSnap.data() as RegisteredEmail;
  if (reg.role !== "PLATFORM_OWNER" || reg.status !== "ACTIVE") {
    throw permissionDenied("Not a platform owner registration");
  }
  if (reg.claimedUid && reg.claimedUid !== uid) {
    throw permissionDenied("Email registered to another account");
  }

  const ts = now();
  const batch = db.batch();

  batch.set(db.collection("platformOwners").doc(uid), {
    email,
    fullName: reg.fullName,
    createdAt: ts,
  });
  batch.set(db.collection("userStoreIndex").doc(uid), {
    role: "PLATFORM_OWNER",
    isPlatformOwner: true,
    createdAt: ts,
  });
  batch.update(db.collection("registeredEmails").doc(emailKey), {
    claimed: true,
    claimedUid: uid,
    claimedAt: ts,
    updatedAt: ts,
  });

  await batch.commit();
  return { repaired: true };
});
