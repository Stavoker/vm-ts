import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { publishScreenshot } from "../events/bus";
import { NAVIGATION_TIMEOUT_MS } from "../constants";

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.cwd(), ".playwright-browsers");
}

type ManagedBrowser = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  screenshotTimer?: NodeJS.Timeout;
};

const activeBrowsers = new Map<string, ManagedBrowser>();

export async function launchScanBrowser(sessionId: string): Promise<ManagedBrowser> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

  const managed: ManagedBrowser = { browser, context, page };
  managed.screenshotTimer = setInterval(async () => {
    try {
      const buffer = await page.screenshot({ type: "jpeg", quality: 60, fullPage: false });
      publishScreenshot(sessionId, `data:image/jpeg;base64,${buffer.toString("base64")}`);
    } catch {
      // page may be navigating
    }
  }, 2000);

  activeBrowsers.set(sessionId, managed);
  return managed;
}

export function getScanBrowser(sessionId: string): ManagedBrowser | undefined {
  return activeBrowsers.get(sessionId);
}

export async function closeScanBrowser(sessionId: string): Promise<void> {
  const managed = activeBrowsers.get(sessionId);
  if (!managed) return;
  if (managed.screenshotTimer) clearInterval(managed.screenshotTimer);
  await managed.context.close().catch(() => undefined);
  await managed.browser.close().catch(() => undefined);
  activeBrowsers.delete(sessionId);
}

export async function capturePageScreenshot(page: Page): Promise<Buffer> {
  return page.screenshot({ type: "png", fullPage: false });
}

export async function detectCaptcha(page: Page): Promise<boolean> {
  const html = await page.content();
  return /captcha|hcaptcha|recaptcha|cf-turnstile/i.test(html);
}

export async function tryLogin(
  page: Page,
  websiteUrl: string,
  credentials: { login?: string; password?: string; loginPageUrl?: string },
  onStep?: (message: string, payload?: Record<string, unknown>) => Promise<void>,
): Promise<{ ok: boolean; message: string }> {
  if (!credentials.login || !credentials.password) {
    return { ok: false, message: "Credentials not provided" };
  }

  const loginUrl = credentials.loginPageUrl || new URL("/login", websiteUrl).toString();
  await onStep?.(`Opening login page: ${loginUrl}`, { loginUrl });
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  if (await detectCaptcha(page)) {
    await onStep?.("CAPTCHA detected on login page", { loginUrl });
    return { ok: false, message: "CAPTCHA detected" };
  }

  const emailSelector = 'input[type="email"], input[name*="email" i], input[name*="login" i], input[type="text"]';
  const passwordSelector = 'input[type="password"]';
  await onStep?.(`Filling login field for ${credentials.login}`, { login: credentials.login });
  await page.fill(emailSelector, credentials.login).catch(() => undefined);
  await page.fill(passwordSelector, credentials.password).catch(() => undefined);
  await onStep?.("Submitting login form", { loginUrl });
  await page.locator('button[type="submit"], input[type="submit"]').first().click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(2500);

  const current = page.url();
  const loggedIn = !/login|signin|sign-in/i.test(current);
  if (loggedIn) {
    await onStep?.(`Login successful, redirected to ${current}`, { currentUrl: current });
  } else {
    await onStep?.("Login could not be confirmed — still on login page", { currentUrl: current });
  }
  return loggedIn
    ? { ok: true, message: `Login appears successful (${current})` }
    : { ok: false, message: "Login could not be confirmed automatically" };
}
