import { describe, expect, it } from "vitest";
import {
  isDangerousFormSubmit,
  isSafeNavigationClick,
} from "@/lib/requirements-check/browser/click-discovery";

describe("button click discovery safety", () => {
  it("allows navigation-like buttons", () => {
    expect(isSafeNavigationClick("Pricing")).toBe(true);
    expect(isSafeNavigationClick("Sign Up")).toBe(true);
    expect(isSafeNavigationClick("Contact support")).toBe(true);
  });

  it("blocks destructive or payment actions", () => {
    expect(isSafeNavigationClick("Pay now")).toBe(false);
    expect(isSafeNavigationClick("Place order")).toBe(false);
    expect(isSafeNavigationClick("Delete account")).toBe(false);
  });

  it("blocks risky form submits", () => {
    expect(isDangerousFormSubmit("Send message", true)).toBe(true);
    expect(isDangerousFormSubmit("Pricing", false)).toBe(false);
  });
});
