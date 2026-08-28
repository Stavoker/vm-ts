import type { ScanContext } from "../types";
import { getPageSnapshot, pageText } from "./shared";

const BUSINESS_PAGE_PATTERN =
  /about|features|pricing|how-it-works|how it works|platform|services|faq|home|landing|solutions|company|product|credits|top-up|ai-writer|ai-image/i;

export function buildBusinessPlanExcerpt(context: ScanContext, maxLength = 20_000): string {
  const sections: string[] = [];

  for (const page of context.pages) {
    const haystack = `${page.url} ${page.title || ""} ${page.pageType || ""}`;
    if (!BUSINESS_PAGE_PATTERN.test(haystack) && page.pageType !== "homepage") continue;
    const snapshot = getPageSnapshot(context, page.url);
    const body = snapshot?.visibleText?.trim();
    if (body) sections.push(`${page.url}\n${body}`);
  }

  const combined = sections.length > 0 ? sections.join("\n\n") : pageText(context);
  return combined.slice(0, maxLength);
}

export function buildSiteContentExcerpt(context: ScanContext, maxLength = 16_000): string {
  const sections: string[] = [];

  for (const page of context.pages.slice(0, 14)) {
    const snapshot = getPageSnapshot(context, page.url);
    const body = snapshot?.visibleText?.trim();
    if (body) sections.push(`${page.url}\n${body.slice(0, 2500)}`);
  }

  const combined = sections.length > 0 ? sections.join("\n\n") : pageText(context);
  return combined.slice(0, maxLength);
}
