import { describe, expect, it } from "vitest";
import type { ScanContext } from "../types";
import { findCommerceFlowPage, hasAuthenticatedPlatform } from "./saas-flow";

function context(pages: ScanContext["pages"], loginSucceeded = false): ScanContext {
  return {
    sessionId: "test",
    websiteUrl: "https://example.com",
    hostname: "example.com",
    loginSucceeded,
    pages,
    results: new Map(),
    emit: async () => {},
    setCurrent: async () => {},
    saveScreenshot: async () => null,
    isCancelled: () => false,
    isPaused: () => false,
    waitIfPaused: async () => {},
  };
}

describe("saas-flow helpers", () => {
  it("finds billing/top-up pages", () => {
    const pages = [
      {
        url: "https://example.com/dashboard/top-up",
        pageType: "other",
        httpStatus: 200,
        title: "Top up",
        checked: true,
      },
    ];
    expect(findCommerceFlowPage(context(pages))?.url).toContain("top-up");
  });

  it("detects authenticated platform after login", () => {
    expect(hasAuthenticatedPlatform(context([], true))).toBe(true);
    expect(
      hasAuthenticatedPlatform(
        context([{ url: "https://example.com/dashboard", pageType: "other", httpStatus: 200, checked: true }]),
      ),
    ).toBe(true);
  });
});
