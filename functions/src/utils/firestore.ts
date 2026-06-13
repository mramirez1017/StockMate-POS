import * as admin from "firebase-admin";

export const db = admin.firestore();

export function storeRef(storeId: string) {
  return db.collection("stores").doc(storeId);
}

export function collection(storeId: string, name: string) {
  return storeRef(storeId).collection(name);
}

export function inventoryDocId(branchId: string, productId: string) {
  return `${branchId}_${productId}`;
}

export function now() {
  return Date.now();
}

/** Firestore rejects undefined field values — omit them before writes */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Recursively remove undefined — required for nested arrays/objects (e.g. sale items). */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) out[key] = stripUndefinedDeep(entry);
    }
    return out as T;
  }
  return value;
}

export function generatePoNumber(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `PO-${n}`;
}

export function generateInternalBarcode(): string {
  return `SM${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}
