import { CallableRequest } from "firebase-functions/v2/https";
import { User, UserRole, CustomPermissions } from "@stockmate/types";
import { db } from "./firestore";
import { permissionDenied, notFound } from "./errors";

export interface AuthContext {
  uid: string;
  storeId: string;
  user: User;
}

export function isStoreAdminRole(role: UserRole | "OWNER"): boolean {
  return role === "ADMIN" || role === "OWNER";
}

function isManagerRole(role: UserRole | "OWNER"): boolean {
  return isStoreAdminRole(role) || role === "STORE_MANAGER";
}

export async function isPlatformOwnerUid(uid: string): Promise<boolean> {
  const poSnap = await db.collection("platformOwners").doc(uid).get();
  if (poSnap.exists) return true;

  const indexSnap = await db.collection("userStoreIndex").doc(uid).get();
  return indexSnap.exists && indexSnap.data()?.isPlatformOwner === true;
}

export async function resolveAuthOptional(uid: string): Promise<AuthContext | null> {
  const indexDoc = await db.collection("userStoreIndex").doc(uid).get();
  if (!indexDoc.exists) return null;

  const indexData = indexDoc.data() as { storeId?: string; isPlatformOwner?: boolean };
  if (indexData.isPlatformOwner || !indexData.storeId) return null;

  const storeId = indexData.storeId;
  const userDoc = await db.collection("stores").doc(storeId).collection("users").doc(uid).get();
  if (!userDoc.exists) return null;

  const user = { id: userDoc.id, ...userDoc.data() } as User;
  if (user.status !== "ACTIVE") return null;

  return { uid, storeId, user };
}

async function resolvePlatformOwnerStoreAuth(
  uid: string,
  storeId: string
): Promise<AuthContext> {
  const poSnap = await db.collection("platformOwners").doc(uid).get();
  const poData = poSnap.data();
  const user: User = {
    id: uid,
    storeId,
    branchId: "",
    fullName: (poData?.fullName as string) ?? "",
    email: (poData?.email as string) ?? "",
    role: "ADMIN",
    status: "ACTIVE",
    createdAt: (poData?.createdAt as number) ?? Date.now(),
    updatedAt: Date.now(),
  };
  return { uid, storeId, user };
}

export async function resolveAuth(request: CallableRequest): Promise<AuthContext> {
  if (!request.auth?.uid) {
    throw permissionDenied("Authentication required");
  }

  const uid = request.auth.uid;
  const staff = await resolveAuthOptional(uid);
  if (staff) return staff;

  if (!(await isPlatformOwnerUid(uid))) {
    throw notFound("User not registered in any store");
  }

  const data = (request.data ?? {}) as Record<string, unknown>;
  const storeId = typeof data.storeId === "string" ? data.storeId.trim() : "";
  if (!storeId) {
    throw permissionDenied("Select a store before performing this action");
  }

  return resolvePlatformOwnerStoreAuth(uid, storeId);
}

export function requireRoles(user: User, roles: UserRole[]): void {
  const role = user.role as UserRole | "OWNER";
  const normalized = role === "OWNER" ? "ADMIN" : role;
  if (!roles.includes(normalized)) {
    throw permissionDenied();
  }
}

export function requireAdmin(user: User): void {
  if (!isStoreAdminRole(user.role as UserRole | "OWNER")) {
    throw permissionDenied();
  }
}

export function requireManagerOrAbove(user: User): void {
  if (!isManagerOrAbove(user)) {
    throw permissionDenied();
  }
}

export function isManagerOrAbove(user: User): boolean {
  return isManagerRole(user.role as UserRole | "OWNER");
}

export function requirePosAccess(user: User): void {
  const role = user.role as UserRole | "OWNER";
  if (!isManagerRole(role) && role !== "CASHIER") {
    throw permissionDenied();
  }
}

export function canChangePrice(user: User): boolean {
  return isStoreAdminRole(user.role as UserRole | "OWNER") || !!user.permissions?.canChangePrice;
}

export function canViewSupplierCost(user: User): boolean {
  return isStoreAdminRole(user.role as UserRole | "OWNER") || !!user.permissions?.canViewSupplierCost;
}

export function canVoidSale(user: User): boolean {
  return isStoreAdminRole(user.role as UserRole | "OWNER") || !!user.permissions?.canVoidSale;
}

export function canApproveAdjustment(user: User): boolean {
  return isStoreAdminRole(user.role as UserRole | "OWNER") || !!user.permissions?.canApproveStockAdjustment;
}

export function assertBranchAccess(user: User, branchId: string): void {
  if (!isStoreAdminRole(user.role as UserRole | "OWNER") && user.branchId !== branchId) {
    throw permissionDenied("Branch access denied");
  }
}

export function hasPermission(user: User, key: keyof CustomPermissions): boolean {
  return !!user.permissions?.[key];
}
