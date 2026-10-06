import { hostnameFromUrl } from "@/lib/analytics/timezone";
import type { BrandProfile, GeneratedPost } from "./types";

export function canonicalSiteUrl(raw: string): string {
  try {
    const withProtocol = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    const url = new URL(withProtocol);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

export function siteHost(url: string): string {
  return hostnameFromUrl(canonicalSiteUrl(url));
}

export function textMentionsSite(text: string, url: string): boolean {
  const canonical = canonicalSiteUrl(url).toLowerCase();
  const host = siteHost(url).toLowerCase();
  const hay = text.toLowerCase();
  return Boolean(host) && (hay.includes(canonical) || hay.includes(host));
}

export function ctaWithSiteUrl(cta: string, url: string): string {
  const canonical = canonicalSiteUrl(url);
  if (cta.includes(canonical)) return /→\s*$/.test(cta) ? cta : `${cta} →`;
  const trimmed = cta.replace(/→\s*$/, "").trim();
  return `${trimmed} ${canonical} →`;
}

export function withSiteUrl(brand: BrandProfile): BrandProfile {
  const url = canonicalSiteUrl(brand.siteUrl);
  return {
    ...brand,
    siteUrl: url,
    domain: siteHost(url) || brand.domain,
    cta: ctaWithSiteUrl(brand.cta, url),
  };
}

export function ensurePostContainsSiteUrl(post: GeneratedPost, url: string): GeneratedPost {
  const canonical = canonicalSiteUrl(url);
  const cta = ctaWithSiteUrl(post.cta, canonical);
  let fullPost = post.fullPost.trim();
  if (!textMentionsSite(fullPost, canonical)) {
    if (post.cta && fullPost.includes(post.cta)) fullPost = fullPost.replace(post.cta, cta);
    else fullPost = `${fullPost}\n\n${cta}`;
  }
  return { ...post, cta, fullPost };
}
