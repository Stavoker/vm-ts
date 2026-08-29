import type { Page } from "playwright";
import {
  MAX_CRAWL_DEPTH,
  MAX_DISCOVERED_PAGES,
  BROWSER_SCROLL_PAUSE_MS,
  BROWSER_SCROLL_MAX_STEPS,
} from "../constants";
import type { DiscoveredPage, PageSnapshot } from "../types";
import { detectPlaceholders } from "../content/placeholders";
import {
  classifyPageType,
  dedupeUrls,
  isCrawlableUrl,
  isExcludedScanUrl,
  isLogoutLink,
  isPublicRouteUrl,
  isSameSite,
  normalizeUrl,
} from "../url-utils";
import { createClickBudget, discoverUrlsViaButtonClicks, type ClickActivity } from "./click-navigator";

export function mergeExplorationResults(
  base: { pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot> },
  extra: { pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot> },
): { pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot> } {
  const snapshots = new Map(base.snapshots);
  for (const [url, snapshot] of extra.snapshots) snapshots.set(url, snapshot);

  const byUrl = new Map(base.pages.map((page) => [page.url, page]));
  for (const page of extra.pages) byUrl.set(page.url, page);

  return { pages: [...byUrl.values()], snapshots };
}

export type ScrollProgress = {
  step: number;
  maxSteps: number;
  scrollHeight: number;
  scrollY: number;
  url: string;
};

export async function scrollPageFully(
  page: Page,
  options?: {
    onProgress?: (progress: ScrollProgress) => Promise<void>;
  },
): Promise<number> {
  let previousHeight = -1;
  let stablePasses = 0;
  const url = page.url();

  for (let step = 0; step < BROWSER_SCROLL_MAX_STEPS; step += 1) {
    const metrics = await page.evaluate(() => ({
      scrollHeight: document.body?.scrollHeight || 0,
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
    }));

    if (
      metrics.scrollHeight === previousHeight &&
      metrics.scrollY + metrics.innerHeight >= metrics.scrollHeight - 4
    ) {
      stablePasses += 1;
      if (stablePasses >= 2) {
        await options?.onProgress?.({
          step: step + 1,
          maxSteps: BROWSER_SCROLL_MAX_STEPS,
          scrollHeight: metrics.scrollHeight,
          scrollY: metrics.scrollY,
          url,
        });
        break;
      }
    } else {
      stablePasses = 0;
    }

    previousHeight = metrics.scrollHeight;
    if (step === 0 || step % 4 === 0) {
      await options?.onProgress?.({
        step: step + 1,
        maxSteps: BROWSER_SCROLL_MAX_STEPS,
        scrollHeight: metrics.scrollHeight,
        scrollY: metrics.scrollY,
        url,
      });
    }

    await page.evaluate((stepSize) => {
      window.scrollBy(0, stepSize);
    }, Math.max(metrics.innerHeight * 0.9, 900));
    await page.waitForTimeout(BROWSER_SCROLL_PAUSE_MS);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  return previousHeight > 0 ? previousHeight : 0;
}

export async function capturePageSnapshot(page: Page, url: string): Promise<PageSnapshot> {
  const payload = await page.evaluate(() => ({
    title: document.title,
    visibleText: document.body?.innerText || "",
    html: document.documentElement.outerHTML.slice(0, 600_000),
    scrollHeight: document.body?.scrollHeight || 0,
  }));

  const placeholders = detectPlaceholders(payload.visibleText);

  return {
    url,
    title: payload.title,
    visibleText: payload.visibleText,
    html: payload.html,
    scrollHeight: payload.scrollHeight,
    placeholders,
  };
}

async function extractDomLinks(page: Page, baseUrl: string, hostname: string): Promise<string[]> {
  const rawLinks = await page.evaluate(() => {
    const out = new Set<string>();
    document.querySelectorAll("a[href]").forEach((node) => {
      const href = node.getAttribute("href");
      if (href) out.add(href);
    });
    document.querySelectorAll("[role='link'][href]").forEach((node) => {
      const href = node.getAttribute("href");
      if (href) out.add(href);
    });
    return [...out];
  });

  const normalized: string[] = [];
  for (const href of rawLinks) {
    if (isLogoutLink(href)) continue;
    const url = normalizeUrl(href, baseUrl);
    if (!url || !isSameSite(url, hostname) || !isCrawlableUrl(url)) continue;
    normalized.push(url);
  }
  return dedupeUrls(normalized);
}

export async function exploreWebsiteWithBrowser(input: {
  page: Page;
  websiteUrl: string;
  hostname: string;
  seedUrls?: string[];
  excludeUrls?: Set<string>;
  authenticatedCrawl?: boolean;
  onPage?: (page: DiscoveredPage, snapshot: PageSnapshot) => Promise<void>;
  onNavigate?: (url: string) => Promise<void>;
  onScrollProgress?: (progress: ScrollProgress) => Promise<void>;
  onExploreProgress?: (visitedPages: number) => Promise<void>;
  onClickActivity?: (activity: ClickActivity) => Promise<void>;
  onClickDiscovery?: (fromUrl: string, discoveredUrl: string, label?: string) => Promise<void>;
  clickBudget?: { remaining: number };
}): Promise<{ pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot> }> {
  const startUrl = normalizeUrl(input.websiteUrl);
  if (!startUrl) return { pages: [], snapshots: new Map() };

  const excluded = input.excludeUrls ?? new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [];
  const seen = new Set<string>();
  const snapshots = new Map<string, PageSnapshot>();
  const pages: DiscoveredPage[] = [];
  const clickBudget = input.clickBudget ?? createClickBudget();

  const enqueue = (url: string, depth: number) => {
    const normalized = normalizeUrl(url);
    if (!normalized || !isCrawlableUrl(normalized)) return;
    if (isExcludedScanUrl(normalized, excluded)) return;
    if (input.authenticatedCrawl && isPublicRouteUrl(normalized, input.websiteUrl)) return;
    if (seen.has(normalized)) return;
    queue.push({ url: normalized, depth });
  };

  enqueue(startUrl, 0);

  for (const seed of input.seedUrls || []) {
    enqueue(seed, 1);
  }

  while (queue.length > 0 && pages.length < MAX_DISCOVERED_PAGES) {
    const current = queue.shift();
    if (!current || current.depth > MAX_CRAWL_DEPTH) continue;
    if (seen.has(current.url)) continue;
    if (isExcludedScanUrl(current.url, excluded)) continue;
    if (input.authenticatedCrawl && isPublicRouteUrl(current.url, input.websiteUrl)) continue;
    seen.add(current.url);

    let httpStatus: number | null = null;
    try {
      await input.onNavigate?.(current.url);
      const response = await input.page.goto(current.url, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      httpStatus = response?.status() ?? null;
      await input.page.waitForTimeout(500);
      await scrollPageFully(input.page, { onProgress: input.onScrollProgress });
      const snapshot = await capturePageSnapshot(input.page, current.url);
      snapshots.set(current.url, snapshot);

      const pageType = classifyPageType(
        current.url,
        snapshot.title,
        snapshot.visibleText,
      );
      const discovered: DiscoveredPage = {
        url: current.url,
        pageType,
        httpStatus,
        title: snapshot.title,
        checked: true,
      };
      pages.push(discovered);
      await input.onPage?.(discovered, snapshot);
      await input.onExploreProgress?.(pages.length);

      if (httpStatus && httpStatus < 400) {
        const links = await extractDomLinks(input.page, current.url, input.hostname);
        for (const link of links) {
          enqueue(link, current.depth + 1);
        }

        const clickDiscovered = await discoverUrlsViaButtonClicks({
          page: input.page,
          baseUrl: current.url,
          websiteUrl: input.websiteUrl,
          hostname: input.hostname,
          seen,
          budget: clickBudget,
          authenticatedCrawl: input.authenticatedCrawl,
          onActivity: input.onClickActivity,
        });
        for (const link of clickDiscovered) {
          if (!isExcludedScanUrl(link, excluded)) {
            enqueue(link, current.depth + 1);
            await input.onClickDiscovery?.(current.url, link);
          }
        }
      }
    } catch {
      pages.push({
        url: current.url,
        pageType: "unknown",
        httpStatus: 0,
        title: "",
        checked: false,
      });
    }
  }

  return { pages, snapshots };
}
