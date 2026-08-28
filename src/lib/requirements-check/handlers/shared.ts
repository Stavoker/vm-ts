import type { RequirementCheckResult, RequirementDefinition, PageSnapshot, ScanContext } from "../types";
import { hasPlaceholderRegistrationNumber } from "../content/placeholders";

export function pass(
  definition: RequirementDefinition,
  explanation: string,
  extra?: Partial<RequirementCheckResult>,
): RequirementCheckResult {
  return {
    requirementId: definition.id,
    status: "PASS",
    explanation,
    handlerUsed: definition.automationHandler,
    completedAt: new Date().toISOString(),
    ...extra,
  };
}

export function fail(
  definition: RequirementDefinition,
  explanation: string,
  extra?: Partial<RequirementCheckResult>,
): RequirementCheckResult {
  return {
    requirementId: definition.id,
    status: "FAIL",
    explanation,
    handlerUsed: definition.automationHandler,
    completedAt: new Date().toISOString(),
    ...extra,
  };
}

export function manual(
  definition: RequirementDefinition,
  explanation: string,
  extra?: Partial<RequirementCheckResult>,
): RequirementCheckResult {
  return {
    requirementId: definition.id,
    status: "MANUAL",
    explanation,
    handlerUsed: definition.automationHandler,
    completedAt: new Date().toISOString(),
    evidence: {
      manualInstruction: definition.manualInstructions,
      timestamp: new Date().toISOString(),
      ...(extra?.evidence || {}),
    },
    ...extra,
  };
}

export function getPageSnapshot(context: ScanContext, url: string): PageSnapshot | undefined {
  return context.pageSnapshots?.get(url);
}

function pageHaystack(context: ScanContext, page: ScanContext["pages"][number]): string {
  const snapshot = getPageSnapshot(context, page.url);
  return `${page.url} ${page.title || ""} ${snapshot?.visibleText || ""} ${snapshot?.html || ""}`;
}

export function pageText(context: ScanContext): string {
  return context.pages.map((page) => pageHaystack(context, page)).join("\n").toLowerCase();
}

export function findPage(context: ScanContext, pattern: RegExp) {
  return context.pages.find((page) => pattern.test(pageHaystack(context, page)));
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function fetchText(url: string): Promise<{ status: number; text: string } | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "VitrinaRequirementsCheck/1.0" },
    });
    const text = await response.text();
    return { status: response.status, text };
  } catch {
    return null;
  }
}

function pageWordCount(context: ScanContext, pageUrl: string): number {
  const snapshot = getPageSnapshot(context, pageUrl);
  if (snapshot?.visibleText) return countWords(snapshot.visibleText);
  return 0;
}

export async function checkLegalPage(
  definition: RequirementDefinition,
  context: ScanContext,
  keywords: string[],
): Promise<RequirementCheckResult> {
  const pattern = new RegExp(keywords.join("|"), "i");
  const page = findPage(context, pattern);
  if (!page) {
    return fail(
      definition,
      `No page matching ${keywords.join(", ")} was discovered across ${context.pages.length} internal pages.`,
    );
  }

  const snapshotWords = pageWordCount(context, page.url);
  if (snapshotWords >= 80) {
    return pass(definition, `Found valid legal page at ${page.url} (${snapshotWords} words, browser-rendered).`, {
      checkedUrl: page.url,
      evidence: {
        url: page.url,
        httpStatus: page.httpStatus,
        textSnippet: getPageSnapshot(context, page.url)?.visibleText.slice(0, 240) || null,
        timestamp: new Date().toISOString(),
      },
    });
  }

  const fetched = await fetchText(page.url);
  if (!fetched || fetched.status >= 400) {
    return fail(definition, `Discovered legal page ${page.url} returned HTTP ${fetched?.status ?? "error"}.`);
  }
  const words = countWords(fetched.text.replace(/<[^>]+>/g, " "));
  if (words < 80) {
    return fail(definition, `Legal page ${page.url} exists but content appears too short (${words} words).`);
  }
  return pass(definition, `Found valid legal page at ${page.url} (${words} words).`, {
    checkedUrl: page.url,
    evidence: {
      url: page.url,
      httpStatus: fetched.status,
      textSnippet: fetched.text.replace(/<[^>]+>/g, " ").slice(0, 240),
      timestamp: new Date().toISOString(),
    },
  });
}

export function detectCompanyInfoMatch(
  definition: RequirementDefinition,
  combined: string,
): { ok: boolean; placeholderIssue?: string } {
  const name = /registered company name displayed/i.test(definition.originalName);
  const address = /company address displayed/i.test(definition.originalName);
  const email = /company email displayed/i.test(definition.originalName);
  const phone = /contact number displayed/i.test(definition.originalName);
  const registration = /registration number displayed/i.test(definition.originalName);

  if (registration && hasPlaceholderRegistrationNumber(combined)) {
    return { ok: false, placeholderIssue: "Registration number appears to be a placeholder (e.g. 00000000)." };
  }

  const ok =
    (name && /(ltd|limited|llc|gmbh|company|corp|inc|ou|as)\b/i.test(combined)) ||
    (address &&
      /(street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|drive|dr\.|boulevard|blvd|address|postal|zip|\b\d{4,6}\b|[\p{L}]{3,}\s+\d{1,4}[-/]\d{1,4})/iu.test(
        combined,
      )) ||
    (email && /@[a-z0-9.-]+\.[a-z]{2,}/i.test(combined)) ||
    (phone && /(\+?\d[\d\s().-]{7,}\d)/.test(combined));

  return { ok };
}
