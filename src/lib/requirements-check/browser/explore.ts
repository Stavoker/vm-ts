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

export type ExplorationAccum = {
  seen: Set<string>;
  pages: DiscoveredPage[];
  snapshots: Map<string, PageSnapshot>;
};

export function createExplorationAccum(): ExplorationAccum {
  return { seen: new Set(), pages: [], snapshots: new Map() };
}

export function mergeExplorationResults(
  base: { pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot> },
  extra: { pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot> },
): { pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot> } {
  const snapshots = new Map(base.snapshots);
  for (const [url, snapshot] of extra.snapshots) snapshots.set(url, snapshot);

  const byUrl = new Map(base.pages.map((page) => [page.url, page]));
  for (const page of extra.pages) byUrl.set(page.url, page);

  return {
    pages: sortDiscoveredPages([...byUrl.values()]),
    snapshots,
  };
}

export function sortExploreQueue(queue: Array<{ url: string; depth: number }>): void {
  queue.sort((a, b) => a.url.localeCompare(b.url) || a.depth - b.depth);
}

export function dequeueExploreQueue(queue: Array<{ url: string; depth: number }>) {
  sortExploreQueue(queue);
  return queue.shift();
}

export function sortDiscoveredPages(pages: DiscoveredPage[]): DiscoveredPage[] {
  return [...pages].sort((a, b) => a.url.localeCompare(b.url));
}

export function finalizeExplorationWithLanding(input: {
  accum: ExplorationAccum;
  landingUrl: string;
  landingPage: DiscoveredPage;
  landingSnapshot: PageSnapshot;
}): { pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot> } {
  input.accum.snapshots.set(input.landingUrl, input.landingSnapshot);
  const byUrl = new Map(input.accum.pages.map((page) => [page.url, page]));
  byUrl.set(input.landingUrl, input.landingPage);
  return {
    pages: sortDiscoveredPages([...byUrl.values()]),
    snapshots: input.accum.snapshots,
  };
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

export async function extractDomLinks(page: Page, baseUrl: string, hostname: string): Promise<string[]> {
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
  return dedupeUrls(normalized).sort((a, b) => a.localeCompare(b));
}

type ExploreQueueItem = { url: string; depth: number };

export async function exploreWebsiteWithBrowser(input: {
  page: Page;
  websiteUrl: string;
  hostname: string;
  seedUrls?: string[];
  excludeUrls?: Set<string>;
  authenticatedCrawl?: boolean;
  accum?: ExplorationAccum;
  onPage?: (page: DiscoveredPage, snapshot: PageSnapshot) => Promise<void>;
  onNavigate?: (url: string) => Promise<void>;
  onScrollProgress?: (progress: ScrollProgress) => Promise<void>;
  onExploreProgress?: (visitedPages: number) => Promise<void>;
  onClickActivity?: (activity: ClickActivity) => Promise<void>;
  onClickDiscovery?: (fromUrl: string, discoveredUrl: string, label?: string) => Promise<void>;
  clickBudget?: { remaining: number };
}): Promise<{ pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot>; accum: ExplorationAccum }> {
  const startUrl = normalizeUrl(input.websiteUrl);
  if (!startUrl) {
    const empty = input.accum ?? createExplorationAccum();
    return { pages: empty.pages, snapshots: empty.snapshots, accum: empty };
  }

  const accum = input.accum ?? createExplorationAccum();
  const excluded = input.excludeUrls ?? new Set<string>();
  const queue: ExploreQueueItem[] = [];
  const clickBudget = input.clickBudget ?? createClickBudget();
  const visitedThisPass: string[] = [];

  const shouldSkip = (url: string, forVisit: boolean) => {
    if (!url || !isCrawlableUrl(url)) return true;
    if (isExcludedScanUrl(url, excluded)) return true;
    if (input.authenticatedCrawl && isPublicRouteUrl(url, input.websiteUrl)) return true;
    if (forVisit && accum.seen.has(url)) return true;
    return false;
  };

  const enqueue = (url: string, depth: number) => {
    const normalized = normalizeUrl(url);
    if (!normalized || shouldSkip(normalized, false)) return;
    if (accum.seen.has(normalized)) return;
    queue.push({ url: normalized, depth });
  };

  enqueue(startUrl, 0);
  for (const seed of [...(input.seedUrls || [])].sort((a, b) => a.localeCompare(b))) {
    enqueue(seed, 1);
  }

  const visitPage = async (current: ExploreQueueItem): Promise<string[]> => {
    await input.onNavigate?.(current.url);
    const response = await input.page.goto(current.url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    const httpStatus = response?.status() ?? null;
    await input.page.waitForTimeout(500);
    await scrollPageFully(input.page, { onProgress: input.onScrollProgress });
    const snapshot = await capturePageSnapshot(input.page, current.url);
    accum.snapshots.set(current.url, snapshot);

    const pageType = classifyPageType(current.url, snapshot.title, snapshot.visibleText);
    const discovered: DiscoveredPage = {
      url: current.url,
      pageType,
      httpStatus,
      title: snapshot.title,
      checked: true,
    };
    accum.pages.push(discovered);
    visitedThisPass.push(current.url);
    await input.onPage?.(discovered, snapshot);
    await input.onExploreProgress?.(accum.pages.length);

    if (!httpStatus || httpStatus >= 400) return [];
    return extractDomLinks(input.page, current.url, input.hostname);
  };

  // Phase 1: deterministic href-only BFS
  while (queue.length > 0 && accum.pages.length < MAX_DISCOVERED_PAGES) {
    const current = dequeueExploreQueue(queue);
    if (!current || current.depth > MAX_CRAWL_DEPTH) continue;
    if (shouldSkip(current.url, true)) continue;

    accum.seen.add(current.url);

    try {
      const links = await visitPage(current);
      for (const link of links) {
        enqueue(link, current.depth + 1);
      }
    } catch {
      accum.pages.push({
        url: current.url,
        pageType: "unknown",
        httpStatus: 0,
        title: "",
        checked: false,
      });
    }
  }

  // Phase 2: menu-first clicks on pages visited in this pass (sorted URL order)
  for (const pageUrl of [...visitedThisPass].sort((a, b) => a.localeCompare(b))) {
    if (clickBudget.remaining <= 0) break;
    if (accum.pages.length >= MAX_DISCOVERED_PAGES) break;

    try {
      await input.page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await input.page.waitForTimeout(400);
      await scrollPageFully(input.page, { onProgress: input.onScrollProgress });

      const clickDiscovered = await discoverUrlsViaButtonClicks({
        page: input.page,
        baseUrl: pageUrl,
        websiteUrl: input.websiteUrl,
        hostname: input.hostname,
        seen: accum.seen,
        budget: clickBudget,
        authenticatedCrawl: input.authenticatedCrawl,
        onActivity: input.onClickActivity,
      });

      for (const link of [...clickDiscovered].sort((a, b) => a.localeCompare(b))) {
        if (isExcludedScanUrl(link, excluded)) continue;
        if (input.authenticatedCrawl && isPublicRouteUrl(link, input.websiteUrl)) continue;
        enqueue(link, MAX_CRAWL_DEPTH);
        await input.onClickDiscovery?.(pageUrl, link);
      }
    } catch {
      // continue with next page for click discovery
    }
  }

  // Phase 3: visit routes discovered via clicks (href-only, deterministic)
  while (queue.length > 0 && accum.pages.length < MAX_DISCOVERED_PAGES) {
    const current = dequeueExploreQueue(queue);
    if (!current || current.depth > MAX_CRAWL_DEPTH) continue;
    if (shouldSkip(current.url, true)) continue;

    accum.seen.add(current.url);

    try {
      const links = await visitPage(current);
      for (const link of links) {
        enqueue(link, current.depth + 1);
      }
    } catch {
      accum.pages.push({
        url: current.url,
        pageType: "unknown",
        httpStatus: 0,
        title: "",
        checked: false,
      });
    }
  }

  return { pages: accum.pages, snapshots: accum.snapshots, accum };
}
