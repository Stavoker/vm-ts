import { afterEach, describe, expect, it } from "vitest";
import { verifyCredentials } from "./credentials";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env.ADMIN_EMAIL = ORIGINAL.ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ORIGINAL.ADMIN_PASSWORD;
});

describe("verifyCredentials", () => {
  it("accepts the configured email and password", () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "secret-pass";
    expect(verifyCredentials("admin@example.com", "secret-pass")).toBe(true);
    expect(verifyCredentials("Admin@Example.com", "secret-pass")).toBe(true);
  });

  it("rejects a wrong password or email", () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "secret-pass";
    expect(verifyCredentials("admin@example.com", "wrong")).toBe(false);
    expect(verifyCredentials("other@example.com", "secret-pass")).toBe(false);
  });

  it("rejects empty configuration", () => {
    process.env.ADMIN_EMAIL = "";
    process.env.ADMIN_PASSWORD = "secret-pass";
    expect(verifyCredentials("admin@example.com", "secret-pass")).toBe(false);
  });
});
