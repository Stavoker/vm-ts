import type { RequirementResultRow, RequirementResultStatus } from "../types";

export const PDF_STATUS_COLORS: Record<
  RequirementResultStatus,
  { fill: string; text: string; label: string }
> = {
  PASS: { fill: "#dcfce7", text: "#166534", label: "PASS" },
  FAIL: { fill: "#fee2e2", text: "#991b1b", label: "FAIL" },
  MANUAL: { fill: "#fef9c3", text: "#854d0e", label: "MANUAL" },
};

const DEFAULT_COMMENT_MAX = 120;
const FAIL_COMMENT_MAX = 200;

function stripRedundantManualInstruction(row: RequirementResultRow): string {
  const explanation = row.explanation.trim();
  const manual = row.evidence?.manualInstruction?.trim();
  if (!manual) return explanation;

  const normalizedManual = manual.replace(/\.$/, "");
  const normalizedName = `Manually verify: ${row.requirement_name}`.replace(/\.$/, "");
  if (normalizedManual === normalizedName || explanation.includes(normalizedManual)) {
    return explanation;
  }

  return explanation;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

/** Short comment for compact PDF rows. PASS items return empty string. */
export function buildCompactComment(
  row: RequirementResultRow,
  maxLength = DEFAULT_COMMENT_MAX,
): string {
  if (row.status === "PASS") return "";

  const parts = [stripRedundantManualInstruction(row)];

  const url = row.checked_url || row.checkedUrl;
  if (url) parts.push(url);

  if (row.evidence?.calculatedValue) {
    parts.push(String(row.evidence.calculatedValue));
  }

  return truncate(parts.filter(Boolean).join(" · "), maxLength);
}

/** Slightly longer comment for the critical-failures summary block. */
export function buildIssueComment(row: RequirementResultRow): string {
  return buildCompactComment(row, row.status === "FAIL" ? FAIL_COMMENT_MAX : DEFAULT_COMMENT_MAX);
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

export type CategorySummary = {
  category: string;
  subCategory: string;
  total: number;
  pass: number;
  manual: number;
  fail: number;
  score: number;
};

export function summarizeBySubCategory(results: RequirementResultRow[]): CategorySummary[] {
  const summaries: CategorySummary[] = [];
  for (const [key, rows] of groupResultsByCategory(results)) {
    const [category, subCategory] = key.split("::");
    const pass = rows.filter((row) => row.status === "PASS").length;
    const manual = rows.filter((row) => row.status === "MANUAL").length;
    const fail = rows.filter((row) => row.status === "FAIL").length;
    summaries.push({
      category,
      subCategory,
      total: rows.length,
      pass,
      manual,
      fail,
      score: rows.length ? Math.round((pass / rows.length) * 100) : 0,
    });
  }
  return summaries;
}
