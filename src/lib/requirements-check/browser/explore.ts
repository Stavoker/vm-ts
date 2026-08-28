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
  isLogoutLink,
  isSameSite,
  normalizeUrl,
} from "../url-utils";

export async function scrollPageFully(page: Page): Promise<number> {
  let previousHeight = -1;
  let stablePasses = 0;

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
      if (stablePasses >= 2) break;
    } else {
      stablePasses = 0;
    }

    previousHeight = metrics.scrollHeight;
    await page.evaluate(() => {
      window.scrollBy(0, Math.max(window.innerHeight * 0.85, 700));
    });
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
  onPage?: (page: DiscoveredPage, snapshot: PageSnapshot) => Promise<void>;
}): Promise<{ pages: DiscoveredPage[]; snapshots: Map<string, PageSnapshot> }> {
  const startUrl = normalizeUrl(input.websiteUrl);
  if (!startUrl) return { pages: [], snapshots: new Map() };

  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const seen = new Set<string>();
  const snapshots = new Map<string, PageSnapshot>();
  const pages: DiscoveredPage[] = [];

  for (const seed of input.seedUrls || []) {
    const normalized = normalizeUrl(seed);
    if (normalized && isCrawlableUrl(normalized) && !seen.has(normalized)) {
      queue.push({ url: normalized, depth: 1 });
    }
  }

  while (queue.length > 0 && pages.length < MAX_DISCOVERED_PAGES) {
    const current = queue.shift();
    if (!current || current.depth > MAX_CRAWL_DEPTH) continue;
    if (seen.has(current.url)) continue;
    seen.add(current.url);

    let httpStatus: number | null = null;
    try {
      const response = await input.page.goto(current.url, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      httpStatus = response?.status() ?? null;
      await input.page.waitForTimeout(500);
      await scrollPageFully(input.page);
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

      if (httpStatus && httpStatus < 400) {
        const links = await extractDomLinks(input.page, current.url, input.hostname);
        for (const link of links) {
          if (!seen.has(link)) {
            queue.push({ url: link, depth: current.depth + 1 });
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
