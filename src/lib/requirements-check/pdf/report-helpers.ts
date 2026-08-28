import type { RequirementResultRow, RequirementResultStatus } from "../types";

export const PDF_STATUS_COLORS: Record<
  RequirementResultStatus,
  { fill: string; text: string; label: string }
> = {
  PASS: { fill: "#dcfce7", text: "#166534", label: "PASS" },
  FAIL: { fill: "#fee2e2", text: "#991b1b", label: "FAIL" },
  MANUAL: { fill: "#fef9c3", text: "#854d0e", label: "MANUAL" },
};

export function buildIssueComment(row: RequirementResultRow): string {
  if (row.status === "PASS") {
    return "Requirement met based on automated scan evidence.";
  }

  const parts = [row.explanation.trim()];
  if (row.checked_url || row.checkedUrl) {
    parts.push(`Checked URL: ${row.checked_url || row.checkedUrl}`);
  }
  if (row.evidence?.calculatedValue) {
    parts.push(`Detected value: ${row.evidence.calculatedValue}`);
  }
  if (row.evidence?.manualInstruction) {
    parts.push(`Manual follow-up: ${row.evidence.manualInstruction}`);
  }

  if (row.status === "FAIL") {
    parts.push("Recommended action: fix this on the website before onboarding submission.");
  } else {
    parts.push("Recommended action: verify manually and attach supporting evidence if required.");
  }

  return parts.filter(Boolean).join(" ");
}

export function sortResultsForReport(results: RequirementResultRow[]): RequirementResultRow[] {
  const order: Record<RequirementResultStatus, number> = { FAIL: 0, MANUAL: 1, PASS: 2 };
  return [...results].sort((a, b) => {
    const category = a.requirement_category.localeCompare(b.requirement_category);
    if (category !== 0) return category;
    const sub = a.requirement_sub_category.localeCompare(b.requirement_sub_category);
    if (sub !== 0) return sub;
    const status = order[a.status] - order[b.status];
    if (status !== 0) return status;
    return a.requirement_name.localeCompare(b.requirement_name);
  });
}

export function groupResultsByCategory(results: RequirementResultRow[]) {
  const groups = new Map<string, RequirementResultRow[]>();
  for (const row of sortResultsForReport(results)) {
    const key = `${row.requirement_category}::${row.requirement_sub_category}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return groups;
}
