import {
  checkDomainHealth,
  classifyExpiredDomainPage,
  classifyParkingRedirect,
} from "@/lib/domain-check";
import type { CheckResult, SiteStatus } from "@/lib/types";

const HTTP_TIMEOUT_MS = 45_000;
const HTTP_BODY_TIMEOUT_MS = 30_000;
const HTTP_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

const PAYMENT_PATTERNS = [
  /payment\s*required/i,
  /pay\s*(to\s*)?(renew|continue|unlock)/i,
  /invoice\s*(overdue|unpaid)/i,
  /(?:your\s+)?subscription\s+(?:has\s+)?expired/i,
  /(?:renew|activate|pay\s+for)\s+(?:your\s+)?subscription/i,
  /account\s+suspended.*(?:billing|payment|invoice)/i,
  /потрібн[ао]\s*оплат/i,
  /требует?ся\s*оплат/i,
  /рахунок\s*простроч/i,
  /сч[её]т\s*просроч/i,
  /продовж(іть|ити)\s*підписк/i,
  /продлите?\s*подписк/i,
];

/** Ignore marketing copy like "No subscription required" / "never subscriptions". */
const PAYMENT_FALSE_POSITIVE = [
  /\bno\s+subscriptions?\b/i,
  /\bnever\s+subscriptions?\b/i,
  /\bno\s+subscription\s+required\b/i,
  /\bwithout\s+(?:a\s+)?subscription\b/i,
  /\bpay\s+per\s+(?:result|use|generation)\b/i,
];

const BLOCKED_PATTERNS = [
  /access\s*denied/i,
  /site\s*(has\s*been\s*)?(blocked|suspended|disabled)/i,
  /account\s*(suspended|disabled|blocked)/i,
  /this\s*domain\s*has\s*been/i,
  /заблок/i,
  /сайт\s*(заблокован|призупинен|приостановлен)/i,
  /доступ\s*(заборонен|запрещ[её]н)/i,
  /акаунт\s*(заблокован|призупинен)/i,
  /аккаунт\s*(заблокирован|приостановлен)/i,
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matchReason(
  body: string,
  patterns: RegExp[],
  fallback: string,
): string | null {
  for (const pattern of patterns) {
    if (pattern.test(body)) {
      const match = body.match(pattern);
      return match?.[0] ? `Обнаружено: «${match[0]}»` : fallback;
    }
  }
  return null;
}

function looksLikePaymentPage(body: string): boolean {
  if (PAYMENT_FALSE_POSITIVE.some((pattern) => pattern.test(body))) {
    return false;
  }
  return PAYMENT_PATTERNS.some((pattern) => pattern.test(body));
}

function classifyFromBody(
  body: string,
  httpStatus: number,
): Pick<CheckResult, "status" | "status_reason"> | null {
  if (looksLikePaymentPage(body)) {
    const payment = matchReason(body, PAYMENT_PATTERNS, "Требуется оплата");
    return {
      status: "payment_required",
      status_reason: payment,
    };
  }

  const blocked = matchReason(body, BLOCKED_PATTERNS, "Сайт заблокирован");
  if (blocked) {
    return { status: "blocked", status_reason: blocked };
  }

  if (httpStatus === 402) {
    return {
      status: "payment_required",
      status_reason: "HTTP 402 Payment Required",
    };
  }

  if (httpStatus === 403) {
    return {
      status: "blocked",
      status_reason: "HTTP 403 Forbidden",
    };
  }

  return null;
}

function timeoutReason(seconds: number) {
  return `Таймаут ответа (${seconds} сек)`;
}

function isTransientHttpFailure(result: CheckResult): boolean {
  if (result.status !== "offline") return false;
  const reason = result.status_reason || "";
  return (
    reason.includes("Таймаут") ||
    /fetch failed|network|ECONN|ETIMEDOUT|socket|aborted|abort/i.test(reason)
  );
}

async function readResponseBody(
  response: Response,
  contentType: string,
): Promise<string> {
  if (
    !contentType.includes("text") &&
    !contentType.includes("json") &&
    !contentType.includes("html") &&
    contentType
  ) {
    return "";
  }

  const bodyPromise = response.text();
  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error("body-timeout")), HTTP_BODY_TIMEOUT_MS);
  });

  return (await Promise.race([bodyPromise, timeoutPromise])).slice(0, 80_000);
}

async function checkSiteHttpOnce(url: string): Promise<CheckResult> {
  const started = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VitrinaMonitor/1.0; +https://github.com/Stavoker/vm-ts)",
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });

    clearTimeout(timeout);

    const responseTime = Date.now() - started;
    const httpStatus = response.status;
    const contentType = response.headers.get("content-type") || "";
    const body = await readResponseBody(response, contentType);

    const parkingRedirect = classifyParkingRedirect(url, response.url);
    if (parkingRedirect) {
      return {
        ...parkingRedirect,
        http_status: httpStatus,
        response_time_ms: responseTime,
      };
    }

    const expiredPage = classifyExpiredDomainPage(body);
    if (expiredPage) {
      return {
        ...expiredPage,
        http_status: httpStatus,
        response_time_ms: responseTime,
      };
    }

    const classified = classifyFromBody(body, httpStatus);
    if (classified) {
      return {
        ...classified,
        http_status: httpStatus,
        response_time_ms: responseTime,
      };
    }

    if (httpStatus >= 500) {
      return {
        status: "error",
        http_status: httpStatus,
        response_time_ms: responseTime,
        status_reason: `Серверная ошибка HTTP ${httpStatus}`,
      };
    }

    if (httpStatus >= 400) {
      return {
        status: "error",
        http_status: httpStatus,
        response_time_ms: responseTime,
        status_reason: `HTTP ${httpStatus}`,
      };
    }

    return {
      status: "online",
      http_status: httpStatus,
      response_time_ms: responseTime,
      status_reason: null,
    };
  } catch (error) {
    const responseTime = Date.now() - started;
    const message =
      error instanceof Error ? error.message : "Неизвестная сетевая ошибка";

    return {
      status: "offline",
      http_status: null,
      response_time_ms: responseTime,
      status_reason: message.includes("abort")
        ? timeoutReason(Math.round(HTTP_TIMEOUT_MS / 1000))
        : message.includes("body-timeout")
          ? timeoutReason(Math.round(HTTP_BODY_TIMEOUT_MS / 1000))
          : message,
    };
  }
}

export async function checkSiteUrl(url: string): Promise<CheckResult> {
  const started = Date.now();
  const domainIssue = await checkDomainHealth(url);
  if (domainIssue) {
    return {
      ...domainIssue,
      response_time_ms: Date.now() - started,
    };
  }

  let lastResult: CheckResult | null = null;

  for (let attempt = 1; attempt <= HTTP_ATTEMPTS; attempt += 1) {
    const result = await checkSiteHttpOnce(url);
    if (result.status === "online" || !isTransientHttpFailure(result)) {
      return result;
    }

    lastResult = result;
    if (attempt < HTTP_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  return (
    lastResult || {
      status: "offline",
      http_status: null,
      response_time_ms: Date.now() - started,
      status_reason: "Не удалось проверить сайт",
    }
  );
}

/**
 * Telegram only when a site is NOT working:
 * - was online and now broken, or
 * - first check ever and the site is already down.
 * No alerts for healthy sites, recovery, or repeated "still down" checks.
 */
export function shouldNotify(
  previous: SiteStatus | null | undefined,
  next: SiteStatus,
  options?: { isFirstCheck?: boolean },
): boolean {
  if (next === "online") return false;
  if (previous === "online") return true;
  if (options?.isFirstCheck) return true;
  return false;
}

export function isTransientHttpFailureForTests(result: CheckResult): boolean {
  return isTransientHttpFailure(result);
}
