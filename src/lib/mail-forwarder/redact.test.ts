import { describe, expect, it } from "vitest";
import { redactText } from "@/lib/mail-forwarder/redact";

describe("redactText", () => {
  it("hides tokens and leaves ordinary email text", () => {
    expect(redactText("refresh_token=abc123")).toContain("[REDACTED]");
    expect(redactText("Bearer ya29.secret")).toContain("[REDACTED]");
    expect(redactText("Please verify the account.")).toBe("Please verify the account.");
  });
});
