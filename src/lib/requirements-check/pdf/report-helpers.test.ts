import { describe, expect, it } from "vitest";
import { buildIssueComment, sortResultsForReport } from "@/lib/requirements-check/pdf/report-helpers";
import type { RequirementResultRow } from "@/lib/requirements-check/types";

function row(partial: Partial<RequirementResultRow> & Pick<RequirementResultRow, "status" | "requirement_name">) {
  return {
    id: "1",
    session_id: "s1",
    requirement_id: "req",
    requirement_name: partial.requirement_name,
    requirement_category: partial.requirement_category || "Website",
    requirement_sub_category: partial.requirement_sub_category || "General",
    requirement_type: "AUTOMATED",
    weight: 1,
    status: partial.status,
    explanation: partial.explanation || "Example explanation",
    created_at: new Date().toISOString(),
    ...partial,
  } satisfies RequirementResultRow;
}

describe("pdf report helpers", () => {
  it("builds actionable comments for failed checks", () => {
    const comment = buildIssueComment(
      row({
        status: "FAIL",
        requirement_name: "Company address displayed.",
        explanation: "Required company information was not detected after scrolling all discovered pages.",
      }),
    );
    expect(comment).toContain("fix this on the website");
    expect(comment).toContain("Required company information");
  });

  it("sorts failed checks before pass checks", () => {
    const sorted = sortResultsForReport([
      row({ status: "PASS", requirement_name: "B" }),
      row({ status: "FAIL", requirement_name: "A" }),
    ]);
    expect(sorted[0]?.status).toBe("FAIL");
  });
});
