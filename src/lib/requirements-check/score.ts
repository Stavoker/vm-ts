import type { RequirementCheckResult, RequirementDefinition } from "./types";

export function scoreFromResults(
  definitions: RequirementDefinition[],
  results: RequirementCheckResult[],
): {
  overallScore: number;
  automationCoverage: number;
  passed: number;
  manual: number;
  failed: number;
} {
  const resultMap = new Map(results.map((item) => [item.requirementId, item]));
  let earned = 0;
  let max = 0;
  let automatedChecked = 0;
  let automatedTotal = 0;
  let passed = 0;
  let manual = 0;
  let failed = 0;

  for (const definition of definitions) {
    if (!definition.enabled) continue;
    const weight = definition.weight || 1;
    max += weight;
    const result = resultMap.get(definition.id);
    const status = result?.status ?? "MANUAL";

    if (status === "PASS") {
      earned += weight;
      passed += 1;
    } else if (status === "MANUAL") {
      earned += weight * 0.5;
      manual += 1;
    } else {
      failed += 1;
    }

    if (definition.type !== "MANUAL_ONLY") {
      automatedTotal += 1;
      if (status === "PASS") automatedChecked += 1;
    }
  }

  const overallScore = max > 0 ? Math.round((earned / max) * 100) : 0;
  const automationCoverage =
    automatedTotal > 0
      ? Math.round((automatedChecked / automatedTotal) * 100)
      : 0;

  return { overallScore, automationCoverage, passed, manual, failed };
}
