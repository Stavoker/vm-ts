import { describe, expect, it } from "vitest";
import type { ScanContext } from "../types";
import {
  detectContactChannel,
  detectProductOrServiceDescriptions,
  detectTextOrImageLogo,
  visualAbsenceFallbacks,
} from "./visual-ai";

function context(
  pages: ScanContext["pages"],
  snapshots: Map<string, { html: string; visibleText: string; title?: string }>,
): ScanContext {
  return {
    sessionId: "s1",
    websiteUrl: "https://avelnix.net",
    hostname: "avelnix.net",
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

describe("visual-ai heuristics", () => {
  it("passes text wordmark logos without an image", () => {
    const pages = [{ url: "https://avelnix.net/", pageType: "homepage", httpStatus: 200, checked: true }];
    const snapshots = new Map([
      [
        "https://avelnix.net/",
        {
          title: "Avelnix | AI platform",
          html: "<header><a href='/'>Avelnix</a></header>",
          visibleText: "Avelnix AI platform",
        },
      ],
    ]);
    const result = detectTextOrImageLogo(context(pages, snapshots));
    expect(result?.status).toBe("PASS");
    expect(result?.explanation).toContain("Text/wordmark");
  });

  it("accepts support email CTAs as contact availability", () => {
    const pages = [{ url: "https://avelnix.net/", pageType: "homepage", httpStatus: 200, checked: true }];
    const snapshots = new Map([
      [
        "https://avelnix.net/",
        {
          html: "<footer>Contact support@avelnix.net for help</footer>",
          visibleText: "Contact support@avelnix.net for help",
        },
      ],
    ]);
    const result = detectContactChannel(context(pages, snapshots));
    expect(result?.status).toBe("PASS");
    expect(result?.explanation?.toLowerCase()).toContain("support");
  });

  it("treats SaaS pricing pages as product descriptions", () => {
    const pages = [
      { url: "https://avelnix.net/pricing", pageType: "pricing", httpStatus: 200, checked: true },
    ];
    const snapshots = new Map([
      [
        "https://avelnix.net/pricing",
        {
          html: "<main>Pricing</main>",
          visibleText: Array(90).fill("word").join(" "),
        },
      ],
    ]);
    const result = detectProductOrServiceDescriptions(context(pages, snapshots));
    expect(result?.status).toBe("PASS");
    expect(result?.explanation).toContain("pricing");
  });

  it("falls back to FAIL for missing social links instead of MANUAL", () => {
    const pages = [{ url: "https://avelnix.net/", pageType: "homepage", httpStatus: 200, checked: true }];
    const snapshots = new Map([
      ["https://avelnix.net/", { html: "<footer>Privacy</footer>", visibleText: "Privacy" }],
    ]);
    const result = visualAbsenceFallbacks.socialMediaChecker(
      { id: "social", automationHandler: "socialMediaChecker" } as never,
      context(pages, snapshots),
    );
    expect(result.status).toBe("FAIL");
    expect(result.explanation).toContain("No social media icons");
  });
});
