import type { RequirementResultRow } from "./types";

export function compareScans(
  previous: RequirementResultRow[],
  current: RequirementResultRow[],
): {
  scoreDelta: number | null;
  fixed: string[];
  newIssues: string[];
  changedCount: number;
} {
  const prevMap = new Map(previous.map((row) => [row.requirement_id, row]));
  const fixed: string[] = [];
  const newIssues: string[] = [];
  let changedCount = 0;

  for (const row of current) {
    const prev = prevMap.get(row.requirement_id);
    if (!prev) continue;
    if (prev.status !== row.status) changedCount += 1;
    if (prev.status !== "PASS" && row.status === "PASS") fixed.push(row.requirement_name);
    if (prev.status === "PASS" && row.status === "FAIL") newIssues.push(row.requirement_name);
  }

  return {
    scoreDelta: null,
    fixed,
    newIssues,
    changedCount,
  };
}
