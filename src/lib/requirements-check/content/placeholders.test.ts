import { describe, expect, it } from "vitest";
import {
  detectPlaceholders,
  hasPlaceholderRegistrationNumber,
} from "@/lib/requirements-check/content/placeholders";
import { detectCompanyInfoMatch } from "@/lib/requirements-check/handlers/shared";

describe("placeholder detection", () => {
  it("detects zero registration numbers", () => {
    expect(hasPlaceholderRegistrationNumber("Pixora Ltd. · Reg. No. 00000000 · Tallinn")).toBe(true);
  });

  it("detects common filler markers", () => {
    expect(detectPlaceholders("Coming soon and lorem ipsum")).toContain("incomplete content marker");
    expect(detectPlaceholders("Coming soon and lorem ipsum")).toContain("lorem ipsum filler");
  });
});

describe("company info matching", () => {
  const addressDefinition = {
    id: "company_address",
    originalName: "Company address displayed.",
    displayName: "Company address displayed.",
    originalDescription: "",
    category: "",
    subCategory: "",
    type: "AUTOMATED" as const,
    weight: 1,
    severity: "medium" as const,
    enabled: true,
    order: 1,
    automationHandler: "companyInfoChecker",
    manualInstructions: "",
    evidenceRequirements: [],
    sourceReference: "",
    sourceSection: "",
    originalOrder: 1,
    mandatoryLevel: "",
  };

  it("matches international footer addresses after scroll text capture", () => {
    const match = detectCompanyInfoMatch(
      addressDefinition,
      "pixora ltd · vesivärava 50-201, 10152 tallinn",
    );
    expect(match.ok).toBe(true);
  });
});
