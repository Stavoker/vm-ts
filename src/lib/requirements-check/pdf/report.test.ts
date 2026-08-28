import { describe, expect, it } from "vitest";
import { generateRequirementsPdf } from "@/lib/requirements-check/pdf/report";
import type { RequirementCheckSession, RequirementResultRow, RequirementResultStatus } from "@/lib/requirements-check/types";

function mockRow(index: number, status: RequirementResultStatus): RequirementResultRow {
  const categories = [
    { category: "Website & Infrastructure", sub: "1. Domain & hosting" },
    { category: "Website & Infrastructure", sub: "2. Website content & quality" },
    { category: "KYB", sub: "1. Company information" },
    { category: "Business model", sub: "3. Business model & business plan (if start up)" },
  ];
  const bucket = categories[index % categories.length]!;
  return {
    id: `r-${index}`,
    session_id: "session-1",
    requirement_id: `req-${index}`,
    requirement_name: `Requirement ${index + 1}: sample check item for PDF layout`,
    requirement_category: bucket.category,
    requirement_sub_category: bucket.sub,
    requirement_type: "AUTOMATED",
    weight: 1,
    status,
    explanation:
      status === "PASS"
        ? "Check passed based on website evidence."
        : "Additional manual verification may be required for this item.",
    checked_url: status === "PASS" ? undefined : "https://avelnix.net/pricing",
    created_at: "2026-08-28T12:00:00.000Z",
  };
}

function mockSession(): RequirementCheckSession {
  return {
    id: "session-1",
    website_url: "https://avelnix.net",
    hostname: "avelnix.net",
    status: "completed",
    overall_score: 72,
    automation_coverage: 65,
    discovered_pages: 18,
    checked_pages: 14,
    created_at: "2026-08-28T12:00:00.000Z",
    completed_at: "2026-08-28T12:05:00.000Z",
  };
}

function analyzePdfPages(buffer: Buffer) {
  const str = buffer.toString("latin1");
  const streams =
    str.match(/stream[\r\n]+([\s\S]*?)endstream/g)?.map((block) => block.length) || [];
  const footerOnlyPages = streams.filter((size) => size < 250).length;
  return { pageCount: streams.length, footerOnlyPages, streams };
}

describe("generateRequirementsPdf", () => {
  it("does not emit blank trailing pages when adding footers", async () => {
    const results = Array.from({ length: 120 }, (_, index) => {
      const status: RequirementResultStatus =
        index % 5 === 0 ? "FAIL" : index % 3 === 0 ? "MANUAL" : "PASS";
      return mockRow(index, status);
    });

    const pdf = await generateRequirementsPdf({ session: mockSession(), results });
    const { pageCount, footerOnlyPages } = analyzePdfPages(pdf);

    expect(pageCount).toBeGreaterThan(3);
    expect(footerOnlyPages).toBe(0);
    expect(pageCount).toBeLessThan(12);
  });
});
