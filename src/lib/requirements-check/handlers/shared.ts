import type { RequirementCheckResult, RequirementDefinition, ScanContext } from "../types";

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

export function pageText(context: ScanContext): string {
  return context.pages.map((page) => `${page.url} ${page.title || ""}`).join("\n").toLowerCase();
}

export function findPage(context: ScanContext, pattern: RegExp) {
  return context.pages.find((page) => pattern.test(`${page.url} ${page.title || ""}`));
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
