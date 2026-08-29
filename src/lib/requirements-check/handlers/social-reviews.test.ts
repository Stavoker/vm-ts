import { describe, expect, it } from "vitest";
import type { ScanContext } from "../types";
import {
  classifySocialLink,
  extractHrefLinks,
  pageHasCustomerReviews,
  reviewsChecker,
  scanSocialMediaLinks,
  socialMediaChecker,
} from "./social-reviews";

function context(pages: ScanContext["pages"], snapshots: Map<string, { html: string; visibleText: string }>): ScanContext {
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

describe("social-reviews handlers", () => {
  it("detects only real social href links", () => {
    const html = `
      <footer>
        <a href="https://avelnix.net/legal/privacy">Privacy</a>
        <a href="https://instagram.com/pixora">Instagram</a>
      </footer>
    `;
    expect(classifySocialLink("https://instagram.com/pixora", "https://avelnix.net/")).toBe("Instagram");
    expect(classifySocialLink("/legal/privacy", "https://avelnix.net/")).toBeNull();
    expect(extractHrefLinks(html)).toContain("https://instagram.com/pixora");
  });

  it("does not pass social check when only text mentions facebook", () => {
    const pages = [{ url: "https://avelnix.net/", pageType: "homepage", httpStatus: 200, checked: true }];
    const snapshots = new Map([
      [
        "https://avelnix.net/",
        {
          html: "<p>We may share data with Facebook according to policy.</p>",
          visibleText: "We may share data with Facebook according to policy.",
        },
      ],
    ]);
    const result = socialMediaChecker(
      {
        id: "link_all_active_social_media_handles_to_the_website",
        automationHandler: "socialMediaChecker",
      } as never,
      context(pages, snapshots),
    );
    expect(result.status).toBe("MANUAL");
    expect(result.explanation).toContain("No outbound links");
  });

  it("passes social check when at least one network link exists", () => {
    const pages = [{ url: "https://avelnix.net/", pageType: "homepage", httpStatus: 200, checked: true }];
    const snapshots = new Map([
      [
        "https://avelnix.net/",
        {
          html: '<footer><a href="https://twitter.com/pixora">Twitter</a></footer>',
          visibleText: "Footer",
        },
      ],
    ]);
    const result = socialMediaChecker({ id: "social", automationHandler: "socialMediaChecker" } as never, context(pages, snapshots));
    expect(result.status).toBe("PASS");
    expect(result.explanation).toContain("Twitter/X");
  });

  it("does not treat dashboard review UI as testimonials", () => {
    expect(
      pageHasCustomerReviews(
        "https://avelnix.net/dashboard/documents/1",
        "Review your document and grammar correction",
        "<main>Review your document</main>",
      ),
    ).toBe(false);

    const pages = [
      { url: "https://avelnix.net/", pageType: "homepage", httpStatus: 200, checked: true },
      { url: "https://avelnix.net/dashboard/credits", pageType: "account", httpStatus: 200, checked: true },
    ];
    const snapshots = new Map([
      ["https://avelnix.net/", { html: "<h1>AI platform</h1>", visibleText: "Generate images and text" }],
      [
        "https://avelnix.net/dashboard/credits",
        { html: "<button>Review document</button>", visibleText: "Review document grammar correction" },
      ],
    ]);
    const result = reviewsChecker({ id: "reviews", automationHandler: "reviewsChecker" } as never, context(pages, snapshots));
    expect(result.status).toBe("MANUAL");
    expect(result.explanation).toContain("No customer testimonials");
  });

  it("scanSocialMediaLinks ignores dashboard pages", () => {
    const pages = [
      { url: "https://avelnix.net/dashboard", pageType: "account", httpStatus: 200, checked: true },
      { url: "https://avelnix.net/", pageType: "homepage", httpStatus: 200, checked: true },
    ];
    const snapshots = new Map([
      ["https://avelnix.net/dashboard", { html: '<a href="https://facebook.com/x">FB</a>', visibleText: "" }],
      ["https://avelnix.net/", { html: "<p>No social links</p>", visibleText: "Landing" }],
    ]);
    const { hits, checkedPages } = scanSocialMediaLinks(context(pages, snapshots));
    expect(checkedPages).toEqual(["https://avelnix.net/"]);
    expect(hits).toHaveLength(0);
  });
});
