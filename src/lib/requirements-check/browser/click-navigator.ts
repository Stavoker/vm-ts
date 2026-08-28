import type { Page } from "playwright";
import {
  BUTTON_CLICK_PAUSE_MS,
  MAX_BUTTON_CLICKS_PER_PAGE,
  MAX_BUTTON_CLICKS_TOTAL,
  MAX_MENU_TRIGGERS_PER_PAGE,
  MENU_OPEN_PAUSE_MS,
} from "../constants";
import { dedupeUrls, isCrawlableUrl, isLogoutLink, isSameSite, normalizeUrl } from "../url-utils";
import {
  isDangerousFormSubmit,
  isMenuTriggerTarget,
  isSafeBillingFlowClick,
  isSafeNavigationClick,
  type MenuTriggerHints,
} from "./click-discovery";

type ClickTarget = {
  id: number;
  label: string;
  inForm: boolean;
  kind: "button" | "menu-trigger";
  hints: MenuTriggerHints;
};

async function collectClickTargets(page: Page): Promise<ClickTarget[]> {
  return page.evaluate(() => {
    const out: Array<{
      id: number;
      label: string;
      inForm: boolean;
      kind: "button" | "menu-trigger";
      hints: {
        ariaHasPopup: boolean;
        ariaExpanded: boolean;
        hasAvatarImage: boolean;
        hasImageOnly: boolean;
        classHint: string;
      };
    }> = [];
    let id = 0;

    const nodes = document.querySelectorAll(
      'button, [role="button"], [role="menuitem"], input[type="button"], a[role="button"], summary',
    );

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 6 || rect.height < 6) continue;
      const style = window.getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") {
        continue;
      }

      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const aria = node.getAttribute("aria-label") || "";
      const title = node.getAttribute("title") || "";
      const label = `${text} ${aria} ${title}`.replace(/\s+/g, " ").trim();
      const inForm = Boolean(node.closest("form"));
      const classHint = `${node.className || ""} ${node.id || ""}`.toLowerCase();
      const hasAvatarImage = Boolean(
        node.querySelector('img[alt*="avatar" i], img[alt*="profile" i], img[class*="avatar" i]'),
      );
      const hasImageOnly = Boolean(node.querySelector("img, svg")) && text.length <= 2;
      const hints = {
        ariaHasPopup: node.getAttribute("aria-haspopup") === "true" || node.getAttribute("aria-haspopup") === "menu",
        ariaExpanded: node.getAttribute("aria-expanded") === "true" || node.hasAttribute("aria-expanded"),
        hasAvatarImage,
        hasImageOnly,
        classHint,
      };

      const kind: "button" | "menu-trigger" =
        hints.ariaHasPopup || hints.ariaExpanded || /avatar|user-menu|profile-menu|account-menu|dropdown/i.test(classHint)
          ? "menu-trigger"
          : "button";

      node.setAttribute("data-vitrina-click-id", String(id));
      out.push({ id, label, inForm, kind, hints });
      id += 1;
    }

    return out;
  });
}

async function clearClickMarkers(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("[data-vitrina-click-id]").forEach((node) => {
      node.removeAttribute("data-vitrina-click-id");
    });
  });
}

function normalizeDiscoveredUrl(raw: string, baseUrl: string, hostname: string): string | null {
  if (isLogoutLink(raw)) return null;
  const normalized = normalizeUrl(raw, baseUrl);
  if (!normalized || !isSameSite(normalized, hostname) || !isCrawlableUrl(normalized)) return null;
  return normalized;
}

async function extractAllVisibleLinks(page: Page, baseUrl: string, hostname: string): Promise<string[]> {
  const rawLinks = await page.evaluate(() => {
    const out = new Set<string>();
    const selectors = [
      "a[href]",
      "[role='link'][href]",
      "[role='menuitem'] a[href]",
      "[role='menu'] a[href]",
      "[data-radix-popper-content-wrapper] a[href]",
      "[data-state='open'] a[href]",
      "[class*='dropdown' i] a[href]",
      "[class*='popover' i] a[href]",
      "[class*='menu' i] a[href]",
    ];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        const href = node.getAttribute("href");
        if (href) out.add(href);
      });
    }
    return [...out];
  });

  const normalized: string[] = [];
  for (const href of rawLinks) {
    const url = normalizeDiscoveredUrl(href, baseUrl, hostname);
    if (url) normalized.push(url);
  }
  return dedupeUrls(normalized);
}

async function closeOpenMenus(page: Page): Promise<void> {
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(200);
  await page.mouse.click(8, 8).catch(() => null);
  await page.waitForTimeout(150);
}

function shouldClickTarget(target: ClickTarget): boolean {
  if (isDangerousFormSubmit(target.label, target.inForm)) return false;
  if (target.kind === "menu-trigger") {
    return isMenuTriggerTarget(target.label, target.hints);
  }
  return isSafeNavigationClick(target.label) || isSafeBillingFlowClick(target.label);
}

function isBlockedClickLabel(label: string): boolean {
  return /\b(pay now|confirm payment|complete purchase|place order|delete|logout|sign out)\b/i.test(label);
}

async function clickTargetAndCollectUrls(input: {
  page: Page;
  target: ClickTarget;
  baseUrl: string;
  hostname: string;
  seen: Set<string>;
  discovered: string[];
}): Promise<void> {
  const beforeUrl = input.page.url();
  const locator = input.page.locator(`[data-vitrina-click-id="${input.target.id}"]`).first();
  if (!(await locator.count())) return;

  await locator.click({ timeout: 4_000 });
  await input.page.waitForTimeout(
    input.target.kind === "menu-trigger" ? MENU_OPEN_PAUSE_MS : BUTTON_CLICK_PAUSE_MS,
  );

  await Promise.race([
    input.page.waitForURL((url) => url.toString() !== beforeUrl, { timeout: 3_000 }).catch(() => null),
    input.page.waitForSelector("[role='menu'], [data-state='open'], [class*='dropdown' i]", {
      timeout: 3_000,
    }).catch(() => null),
    input.page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => null),
  ]);

  const links = await extractAllVisibleLinks(input.page, input.baseUrl, input.hostname);
  for (const link of links) {
    if (!input.seen.has(link) && !input.discovered.includes(link)) {
      input.discovered.push(link);
    }
  }

  const afterUrl = input.page.url();
  const normalizedAfter = normalizeDiscoveredUrl(afterUrl, input.baseUrl, input.hostname);
  if (normalizedAfter && !input.seen.has(normalizedAfter) && !input.discovered.includes(normalizedAfter)) {
    input.discovered.push(normalizedAfter);
  }

  if (input.target.kind === "menu-trigger" && afterUrl === beforeUrl) {
    const menuItems = input.page.locator(
      "[role='menuitem'], [role='menu'] a, [data-state='open'] a, [class*='dropdown' i] a",
    );
    const count = Math.min(await menuItems.count(), 12);
    for (let i = 0; i < count; i += 1) {
      const item = menuItems.nth(i);
      const itemLabel = ((await item.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      if (!itemLabel || (!isSafeNavigationClick(itemLabel) && !isSafeBillingFlowClick(itemLabel))) continue;
      if (isBlockedClickLabel(itemLabel)) continue;

      const itemHref = await item.getAttribute("href").catch(() => null);
      if (itemHref) {
        const normalized = normalizeDiscoveredUrl(itemHref, input.baseUrl, input.hostname);
        if (normalized && !input.seen.has(normalized) && !input.discovered.includes(normalized)) {
          input.discovered.push(normalized);
        }
        continue;
      }

      try {
        await item.click({ timeout: 3_000 });
        await input.page.waitForTimeout(BUTTON_CLICK_PAUSE_MS);
        const menuNavUrl = normalizeDiscoveredUrl(input.page.url(), input.baseUrl, input.hostname);
        if (menuNavUrl && !input.seen.has(menuNavUrl) && !input.discovered.includes(menuNavUrl)) {
          input.discovered.push(menuNavUrl);
        }
        if (input.page.url() !== beforeUrl) {
          await input.page.goto(beforeUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await input.page.waitForTimeout(250);
          await locator.click({ timeout: 4_000 }).catch(() => null);
          await input.page.waitForTimeout(MENU_OPEN_PAUSE_MS);
        }
      } catch {
        // continue with next menu item
      }
    }
  }

  if (input.page.url() !== beforeUrl) {
    await input.page.goto(beforeUrl, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
    await input.page.waitForTimeout(250);
  } else if (input.target.kind === "menu-trigger") {
    await closeOpenMenus(input.page);
  }
}

export async function discoverUrlsViaButtonClicks(input: {
  page: Page;
  baseUrl: string;
  hostname: string;
  seen: Set<string>;
  budget: { remaining: number };
  maxPerPage?: number;
}): Promise<string[]> {
  const maxPerPage = input.maxPerPage ?? MAX_BUTTON_CLICKS_PER_PAGE;
  const discovered: string[] = [];
  const clickedKeys = new Set<string>();

  const targets = await collectClickTargets(input.page);
  const menuTriggers = targets.filter((t) => t.kind === "menu-trigger").slice(0, MAX_MENU_TRIGGERS_PER_PAGE);
  const buttons = targets.filter((t) => t.kind === "button");

  let clicksOnPage = 0;

  const orderedTargets = [...menuTriggers, ...buttons];

  for (const target of orderedTargets) {
    if (input.budget.remaining <= 0 || clicksOnPage >= maxPerPage) break;
    const clickKey = `${target.kind}:${target.label.toLowerCase() || target.id}`;
    if (clickedKeys.has(clickKey)) continue;
    if (!shouldClickTarget(target)) continue;

    clickedKeys.add(clickKey);

    try {
      await clickTargetAndCollectUrls({
        page: input.page,
        target,
        baseUrl: input.baseUrl,
        hostname: input.hostname,
        seen: input.seen,
        discovered,
      });
      input.budget.remaining -= 1;
      clicksOnPage += 1;
    } catch {
      await closeOpenMenus(input.page);
    }
  }

  await clearClickMarkers(input.page);
  return discovered;
}

export function createClickBudget(total = MAX_BUTTON_CLICKS_TOTAL): { remaining: number } {
  return { remaining: total };
}
