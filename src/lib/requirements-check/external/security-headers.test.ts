import { describe, expect, it } from "vitest";
import { evaluateSecurityHeaders } from "@/lib/requirements-check/external/security-headers";

describe("security headers evaluation", () => {
  it("scores full marks when all recommended headers are present", () => {
    const result = evaluateSecurityHeaders({
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "content-security-policy": "default-src 'self'",
      "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "geolocation=()",
    });
    expect(result.score).toBe(100);
    expect(result.missing).toEqual([]);
  });

  it("accepts CSP frame-ancestors as x-frame-options alternative", () => {
    const result = evaluateSecurityHeaders({
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    expect(result.present).toContain("X-Frame-Options");
    expect(result.present).toContain("Content-Security-Policy");
  });

  it("reports missing headers with reduced score", () => {
    const result = evaluateSecurityHeaders({
      "x-content-type-options": "nosniff",
    });
    expect(result.score).toBeLessThan(100);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.present).toContain("X-Content-Type-Options");
  });
});
