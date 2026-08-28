import type { ScanContext } from "../types";
import { findPage } from "./shared";

export const CART_PAGE_PATTERN = /\/cart|\/basket|\/bag\b|shopping[- ]cart/i;

export const COMMERCE_FLOW_PATTERN =
  /checkout|\/order|top[- ]?up|topup|top_up|\/billing|\/wallet|\/credits|\/deposit|\/payment|\/subscribe|\/upgrade/i;

export const AUTHENTICATED_PLATFORM_PATTERN =
  /\/dashboard|\/account|\/settings|\/billing|\/top-up|\/topup|\/wallet|\/credits/i;

export const TWO_FACTOR_PATTERN =
  /two[- ]?factor|2fa|mfa|authenticator|verification code|one[- ]time password|otp/i;

export function findCartPage(context: ScanContext) {
  return findPage(context, CART_PAGE_PATTERN);
}

export function findCommerceFlowPage(context: ScanContext) {
  return findPage(context, COMMERCE_FLOW_PATTERN);
}

export function findCommercePage(context: ScanContext) {
  return findCartPage(context) || findCommerceFlowPage(context);
}

export function hasAuthenticatedPlatform(context: ScanContext): boolean {
  if (context.loginSucceeded) return true;
  return context.pages.some((page) => AUTHENTICATED_PLATFORM_PATTERN.test(page.url));
}
