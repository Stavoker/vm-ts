import { describe, expect, it } from "vitest";
import { sanitizeTrafficCreatorKey } from "./client";

describe("sanitizeTrafficCreatorKey", () => {
  it("strips quotes, BOM and surrounding whitespace", () => {
    expect(sanitizeTrafficCreatorKey('  "tgp_account_abc"  ')).toBe("tgp_account_abc");
    expect(sanitizeTrafficCreatorKey("\uFEFFtgp_account_abc\n")).toBe("tgp_account_abc");
  });
});
