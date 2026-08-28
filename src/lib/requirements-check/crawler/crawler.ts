import {
  MAX_CRAWL_DEPTH,
  MAX_DISCOVERED_PAGES,
  PAGE_TIMEOUT_MS,
} from "../constants";
import type { DiscoveredPage } from "../types";
import {
  classifyPageType,
  dedupeUrls,
  isCrawlableUrl,
  isLogoutLink,
  isSameSite,
  normalizeUrl,
} from "../url-utils";

function extractLinks(html: string, baseUrl: string, hostname: string): string[] {
  const hrefs = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const out: string[] = [];
  for (const href of hrefs) {
    if (isLogoutLink(href)) continue;
    const normalized = normalizeUrl(href, baseUrl);
    if (!normalized || !isSameSite(normalized, hostname) || !isCrawlableUrl(normalized)) continue;
    out.push(normalized);
  }
  return out;
}

async function fetchSitemapUrls(websiteUrl: string, hostname: string): Promise<string[]> {
  const candidates = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml"];
  const urls: string[] = [];
  for (const path of candidates) {
    const sitemapUrl = new URL(path, websiteUrl).toString();
    try {
      const response = await fetch(sitemapUrl, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
      if (!response.ok) continue;
      const text = await response.text();
      const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
      for (const loc of locs) {
        const normalized = normalizeUrl(loc);
        if (normalized && isSameSite(normalized, hostname) && isCrawlableUrl(normalized)) {
          urls.push(normalized);
        }
      }
    } catch {
      // ignore sitemap failures
    }
  }
  return dedupeUrls(urls);
}

export async function crawlWebsite(input: {
  websiteUrl: string;
  hostname: string;
  onPage?: (page: DiscoveredPage) => Promise<void>;
}): Promise<DiscoveredPage[]> {
  const queue: Array<{ url: string; depth: number }> = [];
  const startUrl = normalizeUrl(input.websiteUrl);
  if (startUrl) queue.push({ url: startUrl, depth: 0 });
  const discovered = new Map<string, DiscoveredPage>();
  const sitemapUrls = await fetchSitemapUrls(input.websiteUrl, input.hostname);
  for (const url of sitemapUrls) {
    if (isCrawlableUrl(url)) queue.push({ url, depth: 1 });
  }

  while (queue.length > 0 && discovered.size < MAX_DISCOVERED_PAGES) {
    const current = queue.shift();
    if (!current) break;
    if (current.depth > MAX_CRAWL_DEPTH) continue;
    if (discovered.has(current.url)) continue;

    let httpStatus: number | null = null;
    let title = "";
    let html = "";
    try {
      const response = await fetch(current.url, {
        redirect: "follow",
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        headers: { "User-Agent": "VitrinaRequirementsCheck/1.0" },
      });
      httpStatus = response.status;
      html = await response.text();
      const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      title = match?.[1]?.trim() || "";
    } catch {
      httpStatus = 0;
    }

    const pageType = classifyPageType(current.url, title, html.replace(/<[^>]+>/g, " "));
    const page: DiscoveredPage = {
      url: current.url,
      pageType,
      httpStatus,
      title,
      checked: true,
    };
    discovered.set(current.url, page);
    await input.onPage?.(page);

    if (html && httpStatus && httpStatus < 400) {
      for (const link of extractLinks(html, current.url, input.hostname)) {
        if (!discovered.has(link)) {
          queue.push({ url: link, depth: current.depth + 1 });
        }
      }
    }
  }

  return [...discovered.values()];
}

export async function enrichPagesWithBrowser(
  pages: DiscoveredPage[],
  visit: (url: string) => Promise<{ title: string; html: string; httpStatus: number | null }>,
): Promise<DiscoveredPage[]> {
  const out: DiscoveredPage[] = [];
  for (const page of pages.slice(0, MAX_DISCOVERED_PAGES)) {
    try {
      const visited = await visit(page.url);
      out.push({
        ...page,
        title: visited.title || page.title,
        httpStatus: visited.httpStatus ?? page.httpStatus,
        checked: true,
      });
    } catch {
      out.push(page);
    }
  }
  return out;
}
