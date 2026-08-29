import type { RequirementCheckResult, RequirementDefinition, ScanContext } from "../types";
import { getPageSnapshot, manual, pass } from "./shared";

const SOCIAL_NETWORKS = [
  { label: "Facebook", host: /(?:^|\.)facebook\.com$/i },
  { label: "Instagram", host: /(?:^|\.)instagram\.com$/i },
  { label: "LinkedIn", host: /(?:^|\.)linkedin\.com$/i },
  { label: "Twitter/X", host: /(?:^|\.)((?:twitter|x)\.com)$/i },
  { label: "YouTube", host: /(?:^|\.)youtube\.com$/i },
  { label: "TikTok", host: /(?:^|\.)tiktok\.com$/i },
] as const;

const TESTIMONIAL_PATTERNS = [
  /\btestimonials?\b/i,
  /\bwhat our customers say\b/i,
  /\bcustomer reviews?\b/i,
  /\bclient stories\b/i,
  /\btrusted by\b/i,
  /schema\.org\/["']?Review/i,
  /(?:★|\*{3,}|⭐){3,}/,
  /\brated?\s+\d(?:\.\d)?\s*(?:\/|out of)\s*5\b/i,
];

const REVIEW_FALSE_POSITIVE = [
  /\breview (?:your|the|this|my|and edit|document|draft|changes)\b/i,
  /\bunder review\b/i,
  /\bai[- ]writer\b/i,
  /\bgrammar correction\b/i,
  /\btldr summar/i,
  /\bopen user menu\b/i,
];

export function extractHrefLinks(html: string): string[] {
  const links = new Set<string>();
  const pattern = /\shref=["']([^"'#][^"']*)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const href = match[1]?.trim();
    if (href && !href.startsWith("javascript:") && !href.startsWith("mailto:")) {
      links.add(href);
    }
  }
  return [...links];
}

export function classifySocialLink(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    for (const network of SOCIAL_NETWORKS) {
      if (network.host.test(host)) return network.label;
    }
  } catch {
    return null;
  }
  return null;
}

export function isPublicMarketingPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return !/(^|\/)(dashboard|login|signup|sign-up|account|checkout|admin|app)(\/|$)/i.test(path);
  } catch {
    return true;
  }
}

export type SocialLinkHit = {
  network: string;
  href: string;
  pageUrl: string;
};

export function scanSocialMediaLinks(context: ScanContext): {
  hits: SocialLinkHit[];
  checkedPages: string[];
} {
  const hits: SocialLinkHit[] = [];
  const checkedPages: string[] = [];
  const seen = new Set<string>();

  for (const page of context.pages) {
    if (!isPublicMarketingPage(page.url)) continue;
    const snapshot = getPageSnapshot(context, page.url);
    if (!snapshot?.html) continue;
    checkedPages.push(page.url);

    for (const href of extractHrefLinks(snapshot.html)) {
      const network = classifySocialLink(href, page.url);
      if (!network) continue;
      const absolute = new URL(href, page.url).toString();
      const key = `${network}::${absolute}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ network, href: absolute, pageUrl: page.url });
    }
  }

  return { hits, checkedPages };
}

export function pageHasCustomerReviews(pageUrl: string, visibleText: string, html: string): boolean {
  if (!isPublicMarketingPage(pageUrl)) return false;

  const haystack = `${visibleText}\n${html}`;
  if (!TESTIMONIAL_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return false;
  }

  if (
    REVIEW_FALSE_POSITIVE.some((pattern) => pattern.test(haystack)) &&
    !/\btestimonials?\b/i.test(haystack) &&
    !/\bcustomer reviews?\b/i.test(haystack)
  ) {
    return false;
  }

  return true;
}

export function scanCustomerReviews(context: ScanContext): {
  hits: Array<{ pageUrl: string }>;
  checkedPages: string[];
} {
  const hits: Array<{ pageUrl: string }> = [];
  const checkedPages: string[] = [];

  for (const page of context.pages) {
    if (!isPublicMarketingPage(page.url)) continue;
    const snapshot = getPageSnapshot(context, page.url);
    if (!snapshot) continue;
    checkedPages.push(page.url);
    if (pageHasCustomerReviews(page.url, snapshot.visibleText || "", snapshot.html || "")) {
      hits.push({ pageUrl: page.url });
    }
  }

  return { hits, checkedPages };
}

function formatCheckedPages(pages: string[], max = 5): string {
  if (pages.length === 0) return "no public marketing pages";
  const sample = pages.slice(0, max).join(", ");
  const rest = pages.length > max ? ` (+${pages.length - max} more)` : "";
  return `${sample}${rest}`;
}

function formatMissingPages(allPublic: string[], withEvidence: string[]): string {
  const missing = allPublic.filter((url) => !withEvidence.includes(url));
  if (missing.length === 0) return "";
  return ` Not found on: ${formatCheckedPages(missing, 4)}.`;
}

export function socialMediaChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): RequirementCheckResult {
  const { hits, checkedPages } = scanSocialMediaLinks(context);

  if (hits.length === 0) {
    return manual(
      definition,
      [
        `Checked public pages (${checkedPages.length}): ${formatCheckedPages(checkedPages)}.`,
        "No outbound links to Facebook, Instagram, Twitter/X, LinkedIn, YouTube, or TikTok were found in page HTML.",
        "Add linked social icons (typically in the footer) if the brand uses these channels.",
      ].join(" "),
      {
        evidence: {
          calculatedValue: `checked=${checkedPages.length}, social_links=0`,
          textSnippet: checkedPages.slice(0, 6).join("\n"),
        },
      },
    );
  }

  const byNetwork = [...new Set(hits.map((hit) => hit.network))];
  const primary = hits[0]!;
  const detail = hits
    .slice(0, 4)
    .map((hit) => `${hit.network} on ${hit.pageUrl}`)
    .join("; ");

  return pass(
    definition,
    [
      `Confirmed ${byNetwork.join(", ")} link(s): ${detail}.`,
      `Checked public pages: ${formatCheckedPages(checkedPages)}.`,
      formatMissingPages(
        checkedPages,
        hits.map((hit) => hit.pageUrl),
      ).trim(),
    ]
      .filter(Boolean)
      .join(" "),
    {
      checkedUrl: primary.pageUrl,
      evidence: {
        url: primary.href,
        textSnippet: detail,
        calculatedValue: byNetwork.join(", "),
      },
    },
  );
}

export function reviewsChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): RequirementCheckResult {
  const { hits, checkedPages } = scanCustomerReviews(context);

  if (hits.length === 0) {
    return manual(
      definition,
      [
        `Checked public marketing pages (${checkedPages.length}): ${formatCheckedPages(checkedPages)}.`,
        "No customer testimonials, review blocks, or star ratings were detected.",
        "Dashboard/app pages were excluded. Add testimonials or ratings on the homepage or landing pages if available.",
      ].join(" "),
      {
        evidence: {
          calculatedValue: `checked=${checkedPages.length}, testimonial_pages=0`,
          textSnippet: checkedPages.slice(0, 6).join("\n"),
        },
      },
    );
  }

  const pages = hits.map((hit) => hit.pageUrl);
  return pass(
    definition,
    [
      `Testimonials/reviews detected on: ${pages.join(", ")}.`,
      `Also checked without matches: ${formatCheckedPages(checkedPages.filter((url) => !pages.includes(url)), 4) || "none"}.`,
    ].join(" "),
    {
      checkedUrl: pages[0],
      evidence: {
        url: pages[0],
        textSnippet: pages.join(", "),
      },
    },
  );
}
