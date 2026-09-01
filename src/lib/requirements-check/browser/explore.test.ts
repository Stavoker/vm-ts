import { describe, expect, it } from "vitest";
import type { DiscoveredPage, PageSnapshot } from "../types";
import {
  dequeueExploreQueue,
  finalizeExplorationWithLanding,
  mergeExplorationResults,
  sortDiscoveredPages,
  sortExploreQueue,
} from "./explore";

describe("explore helpers", () => {
  it("dequeues URLs in deterministic sorted order", () => {
    const queue = [
      { url: "https://avelnix.net/dashboard", depth: 1 },
      { url: "https://avelnix.net/legal/privacy", depth: 1 },
      { url: "https://avelnix.net/pricing", depth: 1 },
    ];
    expect(dequeueExploreQueue(queue)?.url).toBe("https://avelnix.net/dashboard");
    expect(dequeueExploreQueue(queue)?.url).toBe("https://avelnix.net/legal/privacy");
    expect(dequeueExploreQueue(queue)?.url).toBe("https://avelnix.net/pricing");
  });

  it("sortExploreQueue prefers lower depth for same URL prefix ties", () => {
    const queue = [
      { url: "https://avelnix.net/b", depth: 2 },
      { url: "https://avelnix.net/a", depth: 1 },
    ];
    sortExploreQueue(queue);
    expect(queue[0]?.url).toBe("https://avelnix.net/a");
  });

  it("mergeExplorationResults dedupes by URL and sorts pages", () => {
    const page = (url: string): DiscoveredPage => ({
      url,
      pageType: "unknown",
      httpStatus: 200,
      title: url,
      checked: true,
    });
    const snapshot = (url: string): PageSnapshot => ({
      url,
      title: url,
      visibleText: "",
      html: "",
      scrollHeight: 0,
      placeholders: [],
    });

    const merged = mergeExplorationResults(
      {
        pages: [page("https://avelnix.net/dashboard"), page("https://avelnix.net/pricing")],
        snapshots: new Map([
          ["https://avelnix.net/dashboard", snapshot("https://avelnix.net/dashboard")],
        ]),
      },
      {
        pages: [page("https://avelnix.net/pricing"), page("https://avelnix.net/legal/privacy")],
        snapshots: new Map([
          ["https://avelnix.net/legal/privacy", snapshot("https://avelnix.net/legal/privacy")],
        ]),
      },
    );

    expect(merged.pages.map((item) => item.url)).toEqual([
      "https://avelnix.net/dashboard",
      "https://avelnix.net/legal/privacy",
      "https://avelnix.net/pricing",
    ]);
    expect(merged.snapshots.has("https://avelnix.net/legal/privacy")).toBe(true);
  });

  it("finalizeExplorationWithLanding keeps homepage snapshot and sort order", () => {
    const landingUrl = "https://avelnix.net/";
    const result = finalizeExplorationWithLanding({
      accum: {
        seen: new Set([landingUrl, "https://avelnix.net/dashboard"]),
        pages: [
          {
            url: "https://avelnix.net/dashboard",
            pageType: "account",
            httpStatus: 200,
            title: "Dashboard",
            checked: true,
          },
        ],
        snapshots: new Map(),
      },
      landingUrl,
      landingPage: {
        url: landingUrl,
        pageType: "homepage",
        httpStatus: 200,
        title: "Home",
        checked: true,
      },
      landingSnapshot: {
        url: landingUrl,
        title: "Home",
        visibleText: "Welcome",
        html: "<html></html>",
        scrollHeight: 1200,
        placeholders: [],
      },
    });

    expect(sortDiscoveredPages(result.pages).map((item) => item.url)).toEqual([
      "https://avelnix.net/",
      "https://avelnix.net/dashboard",
    ]);
    expect(result.snapshots.get(landingUrl)?.visibleText).toBe("Welcome");
  });
});
