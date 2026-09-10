import { timingSafeStringEqual } from "./session";

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL || process.env.ADMIN_LOGIN || "").trim();
}

export function verifyCredentials(email: unknown, password: unknown): boolean {
  const expectedEmail = adminEmail();
  const expectedPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!expectedEmail || !expectedPassword) return false;
  if (typeof email !== "string" || typeof password !== "string") return false;

  const emailOk = timingSafeStringEqual(email.trim().toLowerCase(), expectedEmail.toLowerCase());
  const passwordOk = timingSafeStringEqual(password, expectedPassword);
  return emailOk && passwordOk;
}
