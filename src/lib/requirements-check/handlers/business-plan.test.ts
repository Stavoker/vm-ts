import { describe, expect, it } from "vitest";
import type { ScanContext } from "../types";
import { buildBusinessPlanExcerpt, buildSiteContentExcerpt } from "./business-plan";

function context(pages: ScanContext["pages"], snapshots?: Map<string, { visibleText: string }>): ScanContext {
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

describe("business plan excerpts", () => {
  it("builds business excerpt from pricing and features pages", () => {
    const pages = [
      { url: "https://example.com/pricing", pageType: "other", httpStatus: 200, title: "Pricing", checked: true },
      { url: "https://example.com/features", pageType: "other", httpStatus: 200, title: "Features", checked: true },
    ];
    const snapshots = new Map([
      ["https://example.com/pricing", { visibleText: "Credits-based SaaS pricing for marketers." }],
      ["https://example.com/features", { visibleText: "AI writer and image generation platform." }],
    ]);
    const excerpt = buildBusinessPlanExcerpt(context(pages, snapshots));
    expect(excerpt).toContain("Credits-based SaaS");
    expect(excerpt).toContain("AI writer");
  });

  it("builds site content excerpt from explored pages", () => {
    const pages = [
      { url: "https://example.com/", pageType: "homepage", httpStatus: 200, checked: true },
    ];
    const snapshots = new Map([
      ["https://example.com/", { visibleText: "Welcome to our unique content platform." }],
    ]);
    expect(buildSiteContentExcerpt(context(pages, snapshots))).toContain("unique content");
  });
});
