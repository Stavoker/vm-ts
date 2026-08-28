import { REQUIREMENT_DEFINITIONS } from "./registry/definitions";
import type { CoverageReport } from "./types";

export function buildCoverageReportFromDefinitions(
  definitions: Array<{
    id: string;
    type: string;
    automationHandler?: string;
    handler_key?: string;
    enabled?: boolean;
  }>,
): CoverageReport {
  const report: CoverageReport = {
    total: definitions.length,
    mapped: 0,
    automated: 0,
    authenticated: 0,
    aiReview: 0,
    externalData: 0,
    hybrid: 0,
    manualOnly: 0,
    unmapped: 0,
  };

  for (const item of definitions) {
    const handler = item.automationHandler || item.handler_key;
    if (!item.id || !handler) {
      report.unmapped += 1;
      continue;
    }
    report.mapped += 1;
    switch (item.type) {
      case "AUTOMATED":
        report.automated += 1;
        break;
      case "AUTHENTICATED":
        report.authenticated += 1;
        break;
      case "AI_REVIEW":
        report.aiReview += 1;
        break;
      case "EXTERNAL_DATA":
        report.externalData += 1;
        break;
      case "HYBRID":
        report.hybrid += 1;
        break;
      case "MANUAL_ONLY":
        report.manualOnly += 1;
        break;
    }
  }

  return report;
}

/** Source registry file coverage (Master Check List extraction). */
export function buildSourceCoverageReport(): CoverageReport {
  return buildCoverageReportFromDefinitions(
    REQUIREMENT_DEFINITIONS.map((item) => ({
      id: item.id,
      type: item.type,
      automationHandler: item.automationHandler,
      enabled: item.enabled,
    })),
  );
}

export function validateRegistryIntegrity(
  definitions: Array<{
    id: string;
    type: string;
    automationHandler?: string;
    handler_key?: string;
    manualInstructions?: string;
    manual_instructions?: string;
    enabled?: boolean;
    order?: number;
    sort_order?: number;
  }>,
): {
  duplicateIds: string[];
  missingManualInstructions: string[];
  invalidTypes: string[];
} {
  const seen = new Map<string, number>();
  const duplicateIds: string[] = [];
  const missingManualInstructions: string[] = [];
  const validTypes = new Set([
    "AUTOMATED",
    "AUTHENTICATED",
    "AI_REVIEW",
    "EXTERNAL_DATA",
    "HYBRID",
    "MANUAL_ONLY",
  ]);
  const invalidTypes: string[] = [];

  for (const item of definitions) {
    seen.set(item.id, (seen.get(item.id) || 0) + 1);
    if (!validTypes.has(item.type)) invalidTypes.push(item.id);
    if (
      (item.type === "MANUAL_ONLY" || item.type === "HYBRID") &&
      !(item.manualInstructions || item.manual_instructions)?.trim()
    ) {
      missingManualInstructions.push(item.id);
    }
  }

  for (const [id, count] of seen) {
    if (count > 1) duplicateIds.push(id);
  }

  return { duplicateIds, missingManualInstructions, invalidTypes };
}

/** Backward-compatible alias for source-file validation. */
export function buildCoverageReport(): CoverageReport {
  return buildSourceCoverageReport();
}
