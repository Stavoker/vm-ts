import { describe, expect, it } from "vitest";
import {
  isMenuTriggerTarget,
  isSafeBillingFlowClick,
  isSafeNavigationClick,
} from "@/lib/requirements-check/browser/click-discovery";

describe("button click discovery safety", () => {
  it("allows navigation-like buttons", () => {
    expect(isSafeNavigationClick("Pricing")).toBe(true);
    expect(isSafeNavigationClick("Sign Up")).toBe(true);
    expect(isSafeNavigationClick("Contact support")).toBe(true);
  });

  it("allows billing flow navigation labels", () => {
    expect(isSafeBillingFlowClick("Top up balance")).toBe(true);
    expect(isSafeBillingFlowClick("Add funds")).toBe(true);
    expect(isSafeBillingFlowClick("Billing")).toBe(true);
    expect(isSafeBillingFlowClick("Pay now")).toBe(false);
  });

  it("detects avatar and menu triggers", () => {
    expect(
      isMenuTriggerTarget("", {
        ariaHasPopup: true,
        ariaExpanded: false,
        hasAvatarImage: false,
        hasImageOnly: true,
        classHint: "user-menu-trigger",
      }),
    ).toBe(true);
  });

  it("blocks destructive or payment actions", () => {
    expect(isSafeNavigationClick("Pay now")).toBe(false);
    expect(isSafeNavigationClick("Place order")).toBe(false);
    expect(isSafeNavigationClick("Delete account")).toBe(false);
  });
});
