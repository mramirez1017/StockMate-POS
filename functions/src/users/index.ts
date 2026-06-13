import { onCall } from "firebase-functions/v2/https";
import { RegisteredEmail, UserRole, CustomPermissions } from "@stockmate/types";
import { db, now, stripUndefined } from "../utils/firestore";
import { emailDocId, normalizeEmail } from "../utils/email";
import { invalidArgument, permissionDenied, notFound, failedPrecondition } from "../utils/errors";
import { resolveAuthOptional, isPlatformOwnerUid, isStoreAdminRole } from "../utils/auth";

const BRANCH_STAFF_ROLES: UserRole[] = ["STORE_MANAGER", "CASHIER"];
const PLATFORM_OWNER_ROLES: UserRole[] = ["PLATFORM_OWNER", "ADMIN"];

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
