import { REQUIREMENT_DEFINITIONS } from "./registry/definitions";
import type { CoverageReport } from "./types";

export function buildCoverageReport(): CoverageReport {
  const report: CoverageReport = {
    total: REQUIREMENT_DEFINITIONS.length,
    mapped: 0,
    automated: 0,
    authenticated: 0,
    aiReview: 0,
    externalData: 0,
    hybrid: 0,
    manualOnly: 0,
    unmapped: 0,
  };

  for (const item of REQUIREMENT_DEFINITIONS) {
    if (!item.id || !item.automationHandler) {
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
