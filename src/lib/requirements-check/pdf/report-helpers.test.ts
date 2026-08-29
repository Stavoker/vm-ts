import { describe, expect, it } from "vitest";
import {
  buildCompactComment,
  buildIssueComment,
  sortResultsForReport,
  summarizeBySubCategory,
} from "@/lib/requirements-check/pdf/report-helpers";
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
  it("builds compact comments for failed checks without boilerplate", () => {
    const comment = buildIssueComment(
      row({
        status: "FAIL",
        requirement_name: "Company address displayed.",
        explanation: "Required company information was not detected after scrolling all discovered pages.",
      }),
    );
    expect(comment).toContain("Required company information");
    expect(comment).not.toContain("Recommended action");
  });

  it("returns empty compact comment for passed checks", () => {
    expect(
      buildCompactComment(
        row({
          status: "PASS",
          requirement_name: "SSL certificate.",
          explanation: "HTTPS is enabled.",
        }),
      ),
    ).toBe("HTTPS is enabled.");
  });

  it("does not duplicate manual instruction boilerplate", () => {
    const comment = buildCompactComment(
      row({
        status: "MANUAL",
        requirement_name: "Tax country.",
        explanation: "Company/KYB document verification requires supporting documentation.",
        evidence: { manualInstruction: "Manually verify: Tax country." },
      }),
    );
    expect(comment).not.toContain("Manually verify: Tax country.");
  });

  it("sorts failed checks before pass checks", () => {
    const sorted = sortResultsForReport([
      row({ status: "PASS", requirement_name: "B" }),
      row({ status: "FAIL", requirement_name: "A" }),
    ]);
    expect(sorted[0]?.status).toBe("FAIL");
  });

  it("summarizes subcategories", () => {
    const summaries = summarizeBySubCategory([
      row({ status: "PASS", requirement_name: "A", requirement_sub_category: "KYB" }),
      row({ status: "FAIL", requirement_name: "B", requirement_sub_category: "KYB" }),
    ]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.pass).toBe(1);
    expect(summaries[0]?.fail).toBe(1);
  });
});
