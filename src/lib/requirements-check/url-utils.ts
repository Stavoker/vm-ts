export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const url = new URL(raw, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    let pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.pathname = pathname;
    return url.toString();
  } catch {
    return null;
  }
}

export function getHostname(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

export function isSameSite(url: string, hostname: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === hostname || host.endsWith(`.${hostname}`);
  } catch {
    return false;
  }
}

export function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const normalized = normalizeUrl(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function isLogoutLink(href: string): boolean {
  return /logout|sign-out|signout|log-out/i.test(href);
}

export function isCrawlableUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.startsWith("/_next/static/")) return false;
    if (pathname.startsWith("/static/")) return false;
    if (
      /\.(js|mjs|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|avif|ico|map|json|xml|txt|pdf|zip|mp4|webm)$/i.test(
        pathname,
      )
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const AUTH_PLATFORM_PATH =
  /\/(dashboard|app|account|portal|admin|billing|wallet|settings|orders|credits|top-up|topup|checkout|payment|profile|user|members|workspace|console|support|documents|invoices|subscription|subscriptions|ai-writer|ai-image|two-factor)(\/|$)/i;

const PUBLIC_ROUTE_PATH =
  /^\/(login|signin|sign-in|signup|sign-up|register|forgot-password|reset-password|pricing|features|about|contact|blog|faq)(\/|$)/i;

export function isLikelyAuthenticatedPath(url: string): boolean {
  try {
    return AUTH_PLATFORM_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function isPublicRouteUrl(url: string, websiteUrl: string): boolean {
  const normalized = normalizeUrl(url);
  const root = normalizeUrl(websiteUrl);
  if (!normalized) return true;
  if (root && normalized === root) return true;

  try {
    const pathname = new URL(normalized).pathname.toLowerCase();
    if (pathname === "/" || pathname === "") return true;
    if (PUBLIC_ROUTE_PATH.test(pathname)) return true;
    if (/^\/legal(\/|$)/.test(pathname)) return true;
    if (/\/(privacy|terms|cookie|refund|legal)(\/|$|-)/.test(pathname)) return true;
  } catch {
    return true;
  }

  return false;
}

export function buildLandingUrlSet(
  websiteUrl: string,
  pages: Array<{ url: string; pageType?: string }> = [],
): Set<string> {
  const excluded = new Set<string>();
  const root = normalizeUrl(websiteUrl);
  if (root) excluded.add(root);

  for (const page of pages) {
    const normalized = normalizeUrl(page.url);
    if (!normalized) continue;
    if (page.pageType === "homepage") {
      excluded.add(normalized);
      continue;
    }
    try {
      const parsed = new URL(normalized);
      if (parsed.pathname === "/" || parsed.pathname === "") {
        excluded.add(normalized);
      }
    } catch {
      // ignore invalid URLs
    }
  }

  return excluded;
}

export function buildAuthenticatedExploreExclusions(
  websiteUrl: string,
  pages: Array<{ url: string; pageType?: string }> = [],
): Set<string> {
  const excluded = buildLandingUrlSet(websiteUrl, pages);

  for (const page of pages) {
    const normalized = normalizeUrl(page.url);
    if (!normalized) continue;
    if (isPublicRouteUrl(normalized, websiteUrl)) excluded.add(normalized);
    if (page.pageType === "login" || page.pageType === "registration" || page.pageType === "legal") {
      excluded.add(normalized);
    }
  }

  return excluded;
}

export function filterPlatformSeedUrls(
  websiteUrl: string,
  pages: Array<{ url: string; pageType?: string }>,
  extraUrls: string[] = [],
): string[] {
  const excluded = buildAuthenticatedExploreExclusions(websiteUrl, pages);
  const seeds = new Set<string>();

  for (const url of extraUrls) {
    const normalized = normalizeUrl(url);
    if (!normalized || excluded.has(normalized) || isPublicRouteUrl(normalized, websiteUrl)) continue;
    if (isLikelyAuthenticatedPath(normalized)) seeds.add(normalized);
  }

  for (const page of pages) {
    const normalized = normalizeUrl(page.url);
    if (!normalized || excluded.has(normalized) || isPublicRouteUrl(normalized, websiteUrl)) continue;
    if (
      isLikelyAuthenticatedPath(normalized) ||
      page.pageType === "account" ||
      page.pageType === "cart" ||
      page.pageType === "checkout"
    ) {
      seeds.add(normalized);
    }
  }

  return [...seeds];
}

export function isExcludedScanUrl(url: string, excluded: Set<string>): boolean {
  const normalized = normalizeUrl(url);
  return Boolean(normalized && excluded.has(normalized));
}

export function classifyPageType(url: string, title: string, text: string): import("./types").PageType {
  const hay = `${url} ${title} ${text}`.toLowerCase();
  if (/(privacy|terms|refund|delivery|cancellation|cookie|legal)/.test(hay)) return "legal";
  if (/(login|sign-in|signin)/.test(hay)) return "login";
  if (/(register|sign-up|signup|create-account)/.test(hay)) return "registration";
  if (/(account|profile|dashboard|orders|invoice)/.test(hay)) return "account";
  if (/(cart|basket|bag)/.test(hay)) return "cart";
  if (/(checkout|payment)/.test(hay)) return "checkout";
  if (/(contact|support|help-desk|helpdesk)/.test(hay)) return "contact";
  if (/(product|item|sku)/.test(hay)) return "product";
  if (/(category|catalog|collection|shop)/.test(hay)) return "category";
  if (/^https?:\/\/[^/]+\/?$/.test(url)) return "homepage";
  return "unknown";
}
