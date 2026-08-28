import { detectPlaceholders, hasPlaceholderRegistrationNumber } from "../content/placeholders";
import type { ScanContext } from "../types";
import { getPageSnapshot, pageText } from "./shared";

export function haystackForPage(context: ScanContext, url: string): string {
  const snapshot = getPageSnapshot(context, url);
  const page = context.pages.find((item) => item.url === url);
  return `${page?.title || ""}\n${snapshot?.visibleText || ""}\n${snapshot?.html || ""}`;
}

export function findPlaceholderIssue(text: string): string | undefined {
  if (hasPlaceholderRegistrationNumber(text)) {
    return "Registration number appears to be a placeholder.";
  }
  const placeholders = detectPlaceholders(text);
  return placeholders.length > 0 ? placeholders.join(", ") : undefined;
}

export function pageHasHtmlFormWithValidation(context: ScanContext, urlPattern: RegExp): boolean {
  const page = context.pages.find((item) => urlPattern.test(item.url));
  if (!page) return false;
  const hay = haystackForPage(context, page.url);
  if (!/<form[\s>]/i.test(hay)) return false;
  return /required|minlength|maxlength|pattern=|type=["']email["']|type=["']tel["']|aria-invalid|data-invalid/i.test(
    hay,
  );
}

export function pageHasCommerceForm(context: ScanContext, url: string): boolean {
  const hay = haystackForPage(context, url);
  return (
    /<form[\s>]/i.test(hay) &&
    /(amount|total|price|payment|card|checkout|credit|top[- ]?up|subscribe|pay now|buy)/i.test(hay)
  );
}

export function pageHasPricingOrTotals(context: ScanContext, url: string): boolean {
  const hay = haystackForPage(context, url);
  return (
    /(?:€|\$|£|usd|eur|gbp)\s?\d+|\d+[.,]\d{2}\s?(?:€|\$|£)?/i.test(hay) ||
    /\b(total|subtotal|balance|credits|amount due|price)\b/i.test(hay)
  );
}

export function pageHasPromoCodeField(context: ScanContext, url: string): boolean {
  const hay = haystackForPage(context, url);
  return /promo|coupon|discount code|voucher/i.test(hay);
}

export function pageHasCurrencyConversion(context: ScanContext): boolean {
  const text = pageText(context);
  return (
    /currency (converter|conversion|switcher)|convert currency|exchange rate/i.test(text) ||
    (/\bUSD\b/i.test(text) && /\bEUR\b/i.test(text)) ||
    /<select[^>]+currency/i.test(text)
  );
}

export function pageHasEmailPhoneVerification(context: ScanContext): boolean {
  const text = pageText(context);
  return /verify (your )?(email|phone|mobile)|email verification|phone verification|confirm your email|confirm your phone/i.test(
    text,
  );
}

export function pageHasOrderConfirmationSignals(context: ScanContext): boolean {
  const ordersPage = context.pages.find((page) => /\/orders\b|order history|my orders/i.test(`${page.url} ${page.title || ""}`));
  if (ordersPage) return true;
  const text = pageText(context);
  return /order confirmation|payment confirmation|receipt|invoice|transaction history/i.test(text);
}

export function pageHasDeliveryProofSignals(context: ScanContext): boolean {
  const documentsPage = context.pages.some((page) => /\/documents\b|my documents|deliverables/i.test(`${page.url} ${page.title || ""}`));
  if (documentsPage) return true;
  const text = pageText(context);
  return /download|delivered|delivery|generated (image|text|content)|service delivery|digital product/i.test(text);
}

export function hasLandingToCommercePath(context: ScanContext): boolean {
  const hasLanding = context.pages.some((page) => page.pageType === "homepage" || page.url === context.websiteUrl);
  const hasCommerce = context.pages.some((page) =>
    /checkout|top[- ]?up|topup|credits|billing|payment|subscribe|\/orders\b/i.test(page.url),
  );
  return hasLanding && hasCommerce;
}

export function countMeaningfulExploredPages(context: ScanContext): number {
  return context.pages.filter((page) => (page.httpStatus || 200) < 400).length;
}

export function isCreditsBasedBusinessModel(context: ScanContext): boolean {
  const text = pageText(context);
  return /credits|top[- ]?up|balance|wallet|pay[- ]?as[- ]?you[- ]?go|per (word|image|generation)/i.test(text);
}
