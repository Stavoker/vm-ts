const BLOCKED_CLICK_LABELS =
  /\b(pay now|purchase|buy now|delete|remove|logout|log out|sign out|submit order|place order|confirm payment|add to cart|subscribe now|donate|transfer|withdraw|unsubscribe|cancel subscription)\b/i;

const PREFERRED_NAV_LABELS =
  /\b(login|log in|sign up|sign-up|signup|register|features|pricing|faq|about|contact|support|legal|terms|privacy|refund|cookie|menu|home|products|shop|catalog|dashboard|account|profile|settings|help|blog|docs|api|demo|try|get started|learn more|view all|see all|explore|platform|services|company|how it works)\b/i;

export function isSafeNavigationClick(label: string): boolean {
  const text = label.replace(/\s+/g, " ").trim();
  if (!text || text.length > 100) return false;
  if (BLOCKED_CLICK_LABELS.test(text)) return false;
  if (PREFERRED_NAV_LABELS.test(text)) return true;
  if (/^[\p{L}\p{N}\s&./'-]{1,40}$/u.test(text)) return true;
  return false;
}

export function isDangerousFormSubmit(label: string, inForm: boolean): boolean {
  if (!inForm) return false;
  return /submit|send|pay|buy|order|confirm|subscribe|register|sign up|login/i.test(label);
}
