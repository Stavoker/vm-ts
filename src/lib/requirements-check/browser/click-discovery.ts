const BLOCKED_CLICK_LABELS =
  /\b(pay now|confirm payment|complete purchase|place order|submit order|delete account|remove account|logout|log out|sign out|unsubscribe|cancel subscription)\b/i;

const PREFERRED_NAV_LABELS =
  /\b(login|log in|sign up|sign-up|signup|register|features|pricing|faq|about|contact|support|legal|terms|privacy|refund|cookie|menu|home|products|shop|catalog|dashboard|account|profile|settings|help|blog|docs|api|demo|try|get started|learn more|view all|see all|explore|platform|services|company|how it works|top up|top-up|topup|add balance|add funds|billing|wallet|credits|deposit|payment|payments|checkout|billing history|invoices|subscription|my account|user menu)\b/i;

const MENU_TRIGGER_LABELS =
  /\b(account|profile|user|avatar|menu|settings|more|options|open menu|user menu|my account)\b/i;

export type MenuTriggerHints = {
  ariaHasPopup: boolean;
  ariaExpanded: boolean;
  hasAvatarImage: boolean;
  hasImageOnly: boolean;
  classHint: string;
};

export function isSafeNavigationClick(label: string): boolean {
  const text = label.replace(/\s+/g, " ").trim();
  if (!text || text.length > 100) return false;
  if (BLOCKED_CLICK_LABELS.test(text)) return false;
  if (PREFERRED_NAV_LABELS.test(text)) return true;
  if (/^[\p{L}\p{N}\s&./'-]{1,40}$/u.test(text)) return true;
  return false;
}

export function isMenuTriggerTarget(label: string, hints: MenuTriggerHints): boolean {
  if (hints.ariaHasPopup || hints.ariaExpanded) return true;
  if (MENU_TRIGGER_LABELS.test(label)) return true;
  if (/avatar|user-menu|profile-menu|account-menu|dropdown/i.test(hints.classHint)) return true;
  if (hints.hasAvatarImage) return true;
  if (hints.hasImageOnly && label.length <= 3) return true;
  return false;
}

export function isDangerousFormSubmit(label: string, inForm: boolean): boolean {
  if (!inForm) return false;
  return /submit|send|pay now|confirm|complete purchase|place order/i.test(label);
}

export function isSafeBillingFlowClick(label: string): boolean {
  const text = label.replace(/\s+/g, " ").trim();
  if (!text || BLOCKED_CLICK_LABELS.test(text)) return false;
  return /top up|top-up|topup|add balance|add funds|billing|wallet|credits|deposit|payment|checkout|invoice|subscribe|upgrade|add €|add \$/i.test(
    text,
  );
}
