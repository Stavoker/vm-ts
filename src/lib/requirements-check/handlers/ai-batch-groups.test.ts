import { describe, expect, it } from "vitest";
import {
  AI_REQUIREMENT_BATCH_GROUP,
  groupAiDefinitions,
  resolveAiBatchGroup,
} from "@/lib/requirements-check/handlers/ai-batch-groups";
import type { RequirementDefinition } from "@/lib/requirements-check/types";

function aiDefinition(id: string, handler: string, name: string): RequirementDefinition {
  return {
    id,
    originalName: name,
    displayName: name,
    originalDescription: "",
    category: "Website & Infrastructure",
    subCategory: "test",
    type: "AI_REVIEW",
    weight: 1,
    severity: "medium",
    enabled: true,
    order: 1,
    automationHandler: handler,
    manualInstructions: "",
    evidenceRequirements: [],
    sourceReference: "",
    sourceSection: "",
    originalOrder: 1,
    mandatoryLevel: "Required / check",
  };
}

describe("ai batch groups", () => {
  it("maps AI requirements into visual, content, kyb, and business batches", () => {
    expect(Object.keys(AI_REQUIREMENT_BATCH_GROUP).length).toBeGreaterThanOrEqual(24);
    const visual = Object.values(AI_REQUIREMENT_BATCH_GROUP).filter((group) => group === "visual");
    const content = Object.values(AI_REQUIREMENT_BATCH_GROUP).filter((group) => group === "content");
    const kyb = Object.values(AI_REQUIREMENT_BATCH_GROUP).filter((group) => group === "kyb");
    const business = Object.values(AI_REQUIREMENT_BATCH_GROUP).filter((group) => group === "business");
    expect(visual.length).toBeGreaterThanOrEqual(5);
    expect(content.length).toBeGreaterThanOrEqual(3);
    expect(kyb).toHaveLength(2);
    expect(business).toHaveLength(14);
  });

  it("groups definitions for quad batch execution", () => {
    const definitions = Object.entries(AI_REQUIREMENT_BATCH_GROUP).map(([id, group]) =>
      aiDefinition(
        id,
        group === "visual"
          ? "aiReviewChecker"
          : group === "kyb"
            ? "kybVisibilityChecker"
            : group === "business"
              ? "businessPlanAiChecker"
              : "contentQualityChecker",
        id,
      ),
    );
    const grouped = groupAiDefinitions(definitions);
    expect(grouped.business).toHaveLength(14);
  });

  it("falls back to handler-based grouping for unknown ids", () => {
    expect(
      resolveAiBatchGroup(aiDefinition("unknown", "homepageHeroChecker", "hero")),
    ).toBe("visual");
    expect(
      resolveAiBatchGroup(aiDefinition("unknown", "contentQualityChecker", "content")),
    ).toBe("content");
    expect(
      resolveAiBatchGroup(aiDefinition("unknown", "kybVisibilityChecker", "kyb")),
    ).toBe("kyb");
    expect(
      resolveAiBatchGroup(aiDefinition("unknown", "businessPlanAiChecker", "business")),
    ).toBe("business");
  });
});
