import { describe, expect, it } from "vitest";
import type { ScanContext } from "../types";
import { documentKybChecker } from "./website-kyb";
import {
  hasLandingToCommercePath,
  isCreditsBasedBusinessModel,
  pageHasOrderConfirmationSignals,
} from "./surface-check";

function context(pages: ScanContext["pages"], snapshots?: Map<string, { visibleText: string; html?: string }>): ScanContext {
  return {
    sessionId: "test",
    websiteUrl: "https://example.com",
    hostname: "example.com",
    pages,
    results: new Map(),
    pageSnapshots: snapshots as ScanContext["pageSnapshots"],
    emit: async () => {},
    setCurrent: async () => {},
    saveScreenshot: async () => null,
    isCancelled: () => false,
    isPaused: () => false,
    waitIfPaused: async () => {},
  };
}

describe("documentKybChecker", () => {
  it("passes when website-visible KYB info is found", () => {
    const pages = [{ url: "https://example.com/legal/terms", pageType: "legal", httpStatus: 200, checked: true }];
    const snapshots = new Map([
      [
        "https://example.com/legal/terms",
        { visibleText: "Example Ltd, reg. no 12345678, 10 Main Street, London", html: "" },
      ],
    ]);
    const result = documentKybChecker(
      {
        id: "certificate_registry_extract",
        originalName: "Certificate / registry extract.",
        automationHandler: "documentKybChecker",
      } as never,
      context(pages, snapshots),
    );
    expect(result.status).toBe("PASS");
    expect(result.explanation).not.toContain("supporting documentation");
  });

  it("uses soft manual message for document-only KYB items", () => {
    const result = documentKybChecker(
      {
        id: "director_id_passport",
        originalName: "Director ID / passport.",
        automationHandler: "documentKybChecker",
      } as never,
      context([]),
    );
    expect(result.status).toBe("MANUAL");
    expect(result.explanation).toContain("not published on the public website");
  });
});

describe("surface-check helpers", () => {
  it("detects landing to commerce path for SaaS", () => {
    const pages = [
      { url: "https://avelnix.net/", pageType: "homepage", httpStatus: 200, checked: true },
      { url: "https://avelnix.net/dashboard/top-up", pageType: "other", httpStatus: 200, checked: true },
    ];
    expect(hasLandingToCommercePath(context(pages))).toBe(true);
  });

  it("detects orders page as confirmation signal", () => {
    const pages = [{ url: "https://avelnix.net/dashboard/orders", pageType: "other", httpStatus: 200, checked: true }];
    expect(pageHasOrderConfirmationSignals(context(pages))).toBe(true);
  });

  it("detects credits business model", () => {
    const pages = [{ url: "https://avelnix.net/dashboard/credits", pageType: "other", httpStatus: 200, checked: true }];
    const snapshots = new Map([
      ["https://avelnix.net/dashboard/credits", { visibleText: "Buy credits and top up your balance", html: "" }],
    ]);
    expect(isCreditsBasedBusinessModel(context(pages, snapshots))).toBe(true);
  });
});
