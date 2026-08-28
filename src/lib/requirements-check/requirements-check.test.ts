import { describe, expect, it } from "vitest";
import { buildCoverageReport } from "@/lib/requirements-check/coverage";
import { scoreFromResults } from "@/lib/requirements-check/score";
import { validatePublicWebsiteUrl } from "@/lib/requirements-check/ssrf";
import { dedupeUrls, normalizeUrl } from "@/lib/requirements-check/url-utils";
import { REQUIREMENT_DEFINITIONS } from "@/lib/requirements-check/registry/definitions";

describe("requirements registry coverage", () => {
  it("maps all master checklist requirements", () => {
    const report = buildCoverageReport();
    expect(REQUIREMENT_DEFINITIONS.length).toBe(120);
    expect(report.total).toBe(120);
    expect(report.mapped).toBe(120);
    expect(report.unmapped).toBe(0);
  });
});

describe("score calculation", () => {
  it("calculates weighted score with manual as half point", () => {
    const defs = [
      { ...REQUIREMENT_DEFINITIONS[0], weight: 1 },
      { ...REQUIREMENT_DEFINITIONS[1], weight: 1 },
      { ...REQUIREMENT_DEFINITIONS[2], weight: 1 },
      { ...REQUIREMENT_DEFINITIONS[3], weight: 1 },
    ];
    const results = defs.map((def, index) => ({
      requirementId: def.id,
      status: (index === 0 ? "PASS" : index === 1 ? "MANUAL" : "FAIL") as const,
      explanation: "test",
    }));
    const score = scoreFromResults(defs, results);
    expect(score.overallScore).toBe(38);
  });
});

describe("url utils", () => {
  it("normalizes and dedupes urls", () => {
    const urls = dedupeUrls([
      "https://example.com/",
      "https://example.com",
      "https://example.com/about#team",
    ]);
    expect(urls).toEqual(["https://example.com/", "https://example.com/about"]);
  });

  it("rejects unsupported protocols", () => {
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
  });
});

describe("ssrf protection", () => {
  it("blocks localhost urls", () => {
    const result = validatePublicWebsiteUrl("http://localhost:3000");
    expect(result.ok).toBe(false);
  });

  it("allows public https urls", () => {
    const result = validatePublicWebsiteUrl("https://example.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hostname).toBe("example.com");
  });
});
