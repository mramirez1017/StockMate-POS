export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDocId(email: string): string {
  return normalizeEmail(email).replace(/[.@+]/g, "_");
}
