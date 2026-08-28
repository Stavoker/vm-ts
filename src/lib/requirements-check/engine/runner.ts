import fs from "node:fs/promises";
import path from "node:path";
import { createBrowserActivityHooks } from "../browser/activity-log";
import { closeScanBrowser, launchScanBrowser, tryLogin } from "../browser/playwright";
import {
  capturePageSnapshot,
  exploreWebsiteWithBrowser,
  scrollPageFully,
} from "../browser/explore";
import { createClickBudget } from "../browser/click-navigator";
import { MAX_SCAN_DURATION_MS } from "../constants";
import { crawlWebsite } from "../crawler/crawler";
import { publishScanEvent } from "../events/bus";
import { runRequirementHandler } from "../handlers";
import { ensureBatchedAiReviews } from "../handlers/ai-helpers";
import { loadRequirementDefinitions } from "../registry/load-definitions";
import { scoreFromResults } from "../score";
import {
  appendScanEvent,
  clearScanCredentials,
  ensureScanStorageDir,
  getScanCredentials,
  saveDiscoveredPages,
  saveRequirementResults,
  setScanStatus,
  updateScanSession,
} from "../sessions";
import type {
  DiscoveredPage,
  RequirementCheckResult,
  RequirementResultRow,
  ScanContext,
  ScanCredentials,
} from "../types";
import {
  buildAuthenticatedExploreExclusions,
  filterPlatformSeedUrls,
  normalizeUrl,
} from "../url-utils";

const cancelled = new Set<string>();
const paused = new Set<string>();

export function cancelScan(sessionId: string) {
  cancelled.add(sessionId);
}

export function resumeScan(sessionId: string) {
  paused.delete(sessionId);
}

export function pauseScan(sessionId: string) {
  paused.add(sessionId);
}

export async function runRequirementsScan(sessionId: string): Promise<void> {
  const started = Date.now();
  const session = await import("../sessions").then((m) => m.getScanSession(sessionId));
  if (!session) return;

  const credentials = getScanCredentials(sessionId);
  const results = new Map<string, RequirementCheckResult>();
  let pages: ScanContext["pages"] = [];

  const emit = async (type: string, message: string, payload?: Record<string, unknown>) => {
    const event = await appendScanEvent(sessionId, type, message, payload);
    publishScanEvent(event);
  };

  const context: ScanContext = {
    sessionId,
    websiteUrl: session.website_url,
    hostname: session.hostname,
    credentials,
    pages,
    results,
    emit,
    setCurrent: async (page, action) => {
      await updateScanSession(sessionId, {
        current_page: page,
        current_action: action,
      });
    },
    saveScreenshot: async (label, buffer) => {
      const dir = await ensureScanStorageDir(sessionId);
      const file = path.join(dir, `${Date.now()}-${label}.png`);
      await fs.writeFile(file, buffer);
      await updateScanSession(sessionId, { latest_screenshot_path: file });
      return file;
    },
    isCancelled: () => cancelled.has(sessionId),
    isPaused: () => paused.has(sessionId),
    waitIfPaused: async () => {
      while (paused.has(sessionId) && !cancelled.has(sessionId)) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    },
  };

  try {
    await setScanStatus(sessionId, "discovering");
    await updateScanSession(sessionId, { started_at: new Date().toISOString(), progress_percent: 5 });
    await emit("discovery_started", "Discovering internal pages");

    pages = await crawlWebsite({
      websiteUrl: session.website_url,
      hostname: session.hostname,
      onPage: async (page) => {
        await emit("page_discovered", `Discovered ${page.url}`, { url: page.url, pageType: page.pageType });
      },
    });
    context.pages = pages;
    await saveDiscoveredPages(
      sessionId,
      pages.map((page) => ({
        url: page.url,
        page_type: page.pageType,
        http_status: page.httpStatus,
        title: page.title,
        checked: page.checked,
      })),
    );
    await updateScanSession(sessionId, {
      discovered_pages: pages.length,
      checked_pages: pages.length,
      progress_percent: 20,
    });
    await emit("discovery_completed", `Discovered ${pages.length} internal pages`);

    await setScanStatus(sessionId, "running");
    const browser = await launchScanBrowser(sessionId);
    const landingUrl = normalizeUrl(session.website_url) || session.website_url;
    const browserActivity = createBrowserActivityHooks({
      emit,
      setCurrent: context.setCurrent,
    });

    await emit("page_opened", `Opened landing page ${landingUrl}`, { url: landingUrl });
    await browser.page.goto(landingUrl, { waitUntil: "domcontentloaded" });
    await emit("landing_exploration_started", "Scrolling landing page before login");
    await context.setCurrent(landingUrl, "Scrolling landing page");
    await scrollPageFully(browser.page, { onProgress: browserActivity.onScrollProgress });
    const landingSnapshot = await capturePageSnapshot(browser.page, landingUrl);
    const landingScreenshot = await browser.page.screenshot({ type: "png", fullPage: true });
    await context.saveScreenshot("homepage", landingScreenshot);
    context.homepageScreenshotBase64 = `data:image/png;base64,${landingScreenshot.toString("base64")}`;

    const landingPage: DiscoveredPage = {
      url: landingUrl,
      pageType: "homepage",
      httpStatus: 200,
      title: landingSnapshot.title,
      checked: true,
    };
    await emit("landing_exploration_completed", `Landing page explored (${landingSnapshot.scrollHeight}px)`, {
      url: landingUrl,
    });

    let loginOk = false;
    if (credentials?.login && credentials.password) {
      await emit("login_started", "Logging into platform after landing page review");
      await context.setCurrent(null, "Logging in");
      const login = await tryLogin(browser.page, session.website_url, credentials, async (message, payload) => {
        await emit("login_step", message, payload);
      });
      if (login.message.includes("CAPTCHA")) {
        await setScanStatus(sessionId, "paused_for_user");
        await updateScanSession(sessionId, {
          pause_reason: "CAPTCHA detected. Please complete the CAPTCHA in the live browser view.",
        });
        await emit("scan_paused", "CAPTCHA detected");
        await context.waitIfPaused();
      } else {
        loginOk = login.ok;
        await emit(login.ok ? "login_successful" : "login_failed", login.message);
      }
    }

    if (loginOk) {
      const platformExcludeUrls = buildAuthenticatedExploreExclusions(session.website_url, pages);
      const platformSeedUrls = filterPlatformSeedUrls(session.website_url, pages, [
        browser.page.url(),
      ]);

      await emit(
        "platform_exploration_started",
        "Exploring authenticated platform pages without returning to landing",
      );
      const explored = await exploreWebsiteWithBrowser({
        page: browser.page,
        websiteUrl: session.website_url,
        hostname: session.hostname,
        seedUrls: platformSeedUrls,
        excludeUrls: platformExcludeUrls,
        authenticatedCrawl: true,
        clickBudget: createClickBudget(80),
        ...browserActivity,
        onExploreProgress: async (visitedPages) => {
          const progress = Math.min(19, 10 + visitedPages);
          await updateScanSession(sessionId, { progress_percent: progress });
        },
        onPage: async (page, snapshot) => {
          await context.setCurrent(page.url, "Exploring platform page");
          await emit("page_explored", `Explored platform ${page.url}`, {
            url: page.url,
            pageType: page.pageType,
            placeholders: snapshot.placeholders,
          });
        },
        onClickDiscovery: async (fromUrl, discoveredUrl) => {
          await emit("navigation_discovered", `Queued platform page ${discoveredUrl}`, {
            fromUrl,
            discoveredUrl,
          });
        },
      });

      explored.snapshots.set(landingUrl, landingSnapshot);
      pages = [landingPage, ...explored.pages.filter((page) => page.url !== landingUrl)];
      context.pages = pages;
      context.pageSnapshots = explored.snapshots;
    } else {
      await emit("browser_exploration_started", "Exploring public pages with scroll and navigation");
      const explored = await exploreWebsiteWithBrowser({
        page: browser.page,
        websiteUrl: landingUrl,
        hostname: session.hostname,
        seedUrls: pages.map((page) => page.url),
        ...browserActivity,
        onExploreProgress: async (visitedPages) => {
          const progress = Math.min(19, 10 + visitedPages);
          await updateScanSession(sessionId, { progress_percent: progress });
        },
        onPage: async (page, snapshot) => {
          await context.setCurrent(page.url, "Exploring public page");
          await emit("page_explored", `Explored ${page.url} (${snapshot.scrollHeight}px)`, {
            url: page.url,
            pageType: page.pageType,
            placeholders: snapshot.placeholders,
          });
        },
        onClickDiscovery: async (fromUrl, discoveredUrl) => {
          await emit("navigation_discovered", `Queued page ${discoveredUrl}`, {
            fromUrl,
            discoveredUrl,
          });
        },
      });

      explored.snapshots.set(landingUrl, landingSnapshot);
      const byUrl = new Map(explored.pages.map((page) => [page.url, page]));
      byUrl.set(landingUrl, landingPage);
      pages = [...byUrl.values()];
      context.pages = pages;
      context.pageSnapshots = explored.snapshots;
    }

    await saveDiscoveredPages(
      sessionId,
      pages.map((page) => ({
        url: page.url,
        page_type: page.pageType,
        http_status: page.httpStatus,
        title: page.title,
        checked: page.checked,
      })),
    );
    await updateScanSession(sessionId, {
      discovered_pages: pages.length,
      checked_pages: pages.length,
      progress_percent: 18,
    });
    await emit("browser_exploration_completed", `Browser explored ${pages.length} pages`);

    const enabledDefinitions = await loadRequirementDefinitions({ enabledOnly: true });
    await ensureBatchedAiReviews(enabledDefinitions, context);
    await emit("ai_review_completed", "Visual and content AI review batches prepared");

    let index = 0;
    for (const definition of enabledDefinitions) {
      if (context.isCancelled()) break;
      if (Date.now() - started > MAX_SCAN_DURATION_MS) break;
      await context.waitIfPaused();

      index += 1;
      const progress = 20 + Math.round((index / enabledDefinitions.length) * 70);
      await updateScanSession(sessionId, {
        progress_percent: progress,
        current_action: `Checking: ${definition.displayName}`,
      });
      await emit("requirement_started", definition.displayName, { requirementId: definition.id });

      const result = await runRequirementHandler(definition, context);
      results.set(definition.id, result);
      await emit("requirement_completed", `${definition.displayName}: ${result.status}`, {
        requirementId: definition.id,
        status: result.status,
      });
    }

    await setScanStatus(sessionId, "generating_report");
    const resultRows = [...results.values()];
    const score = scoreFromResults(enabledDefinitions, resultRows);

    const dbRows: Omit<RequirementResultRow, "id" | "created_at">[] = enabledDefinitions.map((definition) => {
      const result = results.get(definition.id);
      return {
        session_id: sessionId,
        requirement_id: definition.id,
        requirementId: definition.id,
        requirement_name: definition.displayName,
        requirement_category: definition.category,
        requirement_sub_category: definition.subCategory,
        requirement_type: definition.type,
        weight: definition.weight,
        status: result?.status || "MANUAL",
        explanation: result?.explanation || "Not evaluated",
        checked_url: result?.checkedUrl || null,
        checkedUrl: result?.checkedUrl || null,
        evidence: result?.evidence || null,
        confidence: result?.confidence || null,
        handler_used: result?.handlerUsed || definition.automationHandler,
        handlerUsed: result?.handlerUsed || definition.automationHandler,
        started_at: result?.startedAt || null,
        startedAt: result?.startedAt || null,
        completed_at: result?.completedAt || null,
        completedAt: result?.completedAt || null,
      };
    });

    await saveRequirementResults(sessionId, dbRows);
    await updateScanSession(sessionId, {
      status: context.isCancelled() ? "cancelled" : "completed",
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      overall_score: score.overallScore,
      automation_coverage: score.automationCoverage,
      passed_requirements: score.passed,
      manual_requirements: score.manual,
      failed_requirements: score.failed,
      progress_percent: 100,
      current_page: null,
      current_action: null,
    });
    await emit("scan_completed", `Scan completed with score ${score.overallScore}%`, score);
  } catch (error) {
    await setScanStatus(
      sessionId,
      cancelled.has(sessionId) ? "cancelled" : "failed",
      error instanceof Error ? error.message : "Unknown scan error",
    );
    await emit("error", error instanceof Error ? error.message : "Unknown scan error");
  } finally {
    cancelled.delete(sessionId);
    paused.delete(sessionId);
    clearScanCredentials(sessionId);
    await closeScanBrowser(sessionId);
  }
}

export async function startRequirementsScanJob(sessionId: string, credentials?: ScanCredentials) {
  const { enqueueScanJob } = await import("../jobs/queue");
  const { setScanCredentials } = await import("../sessions");
  setScanCredentials(sessionId, credentials);
  enqueueScanJob(() => runRequirementsScan(sessionId));
}
