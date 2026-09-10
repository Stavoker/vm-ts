import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env.AUTH_SECRET = ORIGINAL.AUTH_SECRET;
  process.env.ADMIN_PASSWORD = ORIGINAL.ADMIN_PASSWORD;
});

describe("session token", () => {
  it("accepts a freshly signed token", () => {
    process.env.AUTH_SECRET = "test-secret-value";
    const token = createSessionToken("admin@example.com");
    expect(verifySessionToken(token)).toBe(true);
  });

  it("rejects a tampered token", () => {
    process.env.AUTH_SECRET = "test-secret-value";
    const token = createSessionToken("admin@example.com");
    expect(verifySessionToken(`${token}x`)).toBe(false);
  });

  it("rejects an expired token", () => {
    process.env.AUTH_SECRET = "test-secret-value";
    const payload = `${Date.now() - 1000}.${Buffer.from("admin@example.com").toString("base64url")}`;
    const signature = createHmac("sha256", "test-secret-value").update(payload).digest("base64url");
    expect(verifySessionToken(`${payload}.${signature}`)).toBe(false);
  });

  it("rejects empty tokens", () => {
    process.env.AUTH_SECRET = "test-secret-value";
    expect(verifySessionToken("")).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });
});
