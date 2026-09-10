import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "vitrina_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.ADMIN_PASSWORD || "";
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return secret;
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = createHmac("sha256", "eq").update(a).digest();
  const right = createHmac("sha256", "eq").update(b).digest();
  return timingSafeEqual(left, right);
}

export function createSessionToken(email: string): string {
  const exp = String(Date.now() + SESSION_TTL_SECONDS * 1000);
  const subject = Buffer.from(email.trim().toLowerCase(), "utf8").toString("base64url");
  const payload = `${exp}.${subject}`;
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  let expected: string;
  try {
    expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  } catch {
    return false;
  }
  if (!timingSafeStringEqual(signature, expected)) return false;
  const exp = Number(payload.split(".")[0]);
  return Number.isFinite(exp) && exp > Date.now();
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
