import type { Page } from "playwright";
import { BUTTON_CLICK_PAUSE_MS, MAX_BUTTON_CLICKS_PER_PAGE, MAX_BUTTON_CLICKS_TOTAL } from "../constants";
import { isCrawlableUrl, isLogoutLink, isSameSite, normalizeUrl } from "../url-utils";
import { isDangerousFormSubmit, isSafeNavigationClick } from "./click-discovery";

type ClickTarget = {
  id: number;
  label: string;
  inForm: boolean;
};

async function collectClickTargets(page: Page): Promise<ClickTarget[]> {
  return page.evaluate(() => {
    const out: ClickTarget[] = [];
    let id = 0;
    const nodes = document.querySelectorAll(
      'button, [role="button"], [role="menuitem"], input[type="button"], a[role="button"]',
    );

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const style = window.getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") {
        continue;
      }

      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const aria = node.getAttribute("aria-label") || "";
      const title = node.getAttribute("title") || "";
      const label = `${text} ${aria} ${title}`.replace(/\s+/g, " ").trim();
      const inForm = Boolean(node.closest("form"));
      node.setAttribute("data-vitrina-click-id", String(id));
      out.push({ id, label, inForm });
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
  const clickedLabels = new Set<string>();

  const targets = await collectClickTargets(input.page);
  let clicksOnPage = 0;

  for (const target of targets) {
    if (input.budget.remaining <= 0 || clicksOnPage >= maxPerPage) break;
    if (!target.label || clickedLabels.has(target.label.toLowerCase())) continue;
    if (!isSafeNavigationClick(target.label)) continue;
    if (isDangerousFormSubmit(target.label, target.inForm)) continue;

    clickedLabels.add(target.label.toLowerCase());
    const beforeUrl = input.page.url();

    try {
      const locator = input.page.locator(`[data-vitrina-click-id="${target.id}"]`).first();
      if (!(await locator.count())) continue;

      await locator.click({ timeout: 4_000 });
      await input.page.waitForTimeout(BUTTON_CLICK_PAUSE_MS);

      await Promise.race([
        input.page.waitForURL((url) => url.toString() !== beforeUrl, { timeout: 4_000 }).catch(() => null),
        input.page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => null),
      ]);

      const afterUrl = input.page.url();
      const normalized = normalizeDiscoveredUrl(afterUrl, input.baseUrl, input.hostname);
      if (normalized && !input.seen.has(normalized) && !discovered.includes(normalized)) {
        discovered.push(normalized);
      }

      if (afterUrl !== beforeUrl) {
        await input.page.goto(beforeUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await input.page.waitForTimeout(250);
      }

      input.budget.remaining -= 1;
      clicksOnPage += 1;
    } catch {
      if (input.page.url() !== beforeUrl) {
        await input.page.goto(beforeUrl, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
      }
    }
  }

  await clearClickMarkers(input.page);
  return discovered;
}

export function createClickBudget(): { remaining: number } {
  return { remaining: MAX_BUTTON_CLICKS_TOTAL };
}
