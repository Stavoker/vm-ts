import { describe, expect, it } from "vitest";
import {
  buildCoverageReportFromDefinitions,
  buildSourceCoverageReport,
  validateRegistryIntegrity,
} from "@/lib/requirements-check/coverage";
import { scoreFromResults } from "@/lib/requirements-check/score";
import { validatePublicWebsiteUrl } from "@/lib/requirements-check/ssrf";
import { dedupeUrls, normalizeUrl } from "@/lib/requirements-check/url-utils";
import { REQUIREMENT_DEFINITIONS } from "@/lib/requirements-check/registry/definitions";
import { mapDefinitionRow } from "@/lib/requirements-check/registry/load-definitions";

describe("requirements registry coverage", () => {
  it("maps all master checklist requirements from source extraction", () => {
    const report = buildSourceCoverageReport();
    expect(REQUIREMENT_DEFINITIONS.length).toBe(120);
    expect(report.total).toBe(120);
    expect(report.mapped).toBe(120);
    expect(report.unmapped).toBe(0);
  });

  it("has no duplicate IDs in source registry", () => {
    const integrity = validateRegistryIntegrity(
      REQUIREMENT_DEFINITIONS.map((item) => ({
        id: item.id,
        type: item.type,
        automationHandler: item.automationHandler,
        manualInstructions: item.manualInstructions,
      })),
    );
    expect(integrity.duplicateIds).toEqual([]);
    expect(integrity.invalidTypes).toEqual([]);
  });

  it("maps database rows to runtime definitions", () => {
    const mapped = mapDefinitionRow({
      id: "website_ssl_active",
      original_name: "SSL certificate is active.",
      display_name: "SSL certificate is active.",
      original_description: "",
      category: "Website & Infrastructure",
      sub_category: "3. Website Functionality",
      requirement_type: "AUTOMATED",
      weight: 1,
      severity: "high",
      enabled: true,
      sort_order: 25,
      handler_key: "sslChecker",
      manual_instructions: "",
      evidence_requirements: ["url"],
      config: { mandatoryLevel: "Mandatory" },
      source_reference: "Master_check_list_for_Website_creation_and_company_onboarding",
      source_section: "3. Website Functionality",
      source_row: 25,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(mapped.automationHandler).toBe("sslChecker");
    expect(mapped.type).toBe("AUTOMATED");
    expect(mapped.mandatoryLevel).toBe("Mandatory");
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

describe("seed SQL generation contract", () => {
  it("expects one upsert per source requirement", async () => {
    const fs = await import("node:fs/promises");
    const seed = await fs.readFile("supabase/requirement_definitions_seed.sql", "utf8");
    const upserts = (seed.match(/on conflict \(id\) do update set/gi) || []).length;
    expect(upserts).toBe(120);
    expect(buildCoverageReportFromDefinitions(REQUIREMENT_DEFINITIONS).unmapped).toBe(0);
  });
});
