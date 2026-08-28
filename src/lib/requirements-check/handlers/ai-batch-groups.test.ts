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
  it("maps all eight AI requirements into visual and content batches", () => {
    expect(Object.keys(AI_REQUIREMENT_BATCH_GROUP)).toHaveLength(8);
    const visual = Object.values(AI_REQUIREMENT_BATCH_GROUP).filter((group) => group === "visual");
    const content = Object.values(AI_REQUIREMENT_BATCH_GROUP).filter((group) => group === "content");
    expect(visual).toHaveLength(5);
    expect(content).toHaveLength(3);
  });

  it("groups definitions for dual batch execution", () => {
    const definitions = Object.entries(AI_REQUIREMENT_BATCH_GROUP).map(([id, group]) =>
      aiDefinition(id, group === "visual" ? "aiReviewChecker" : "contentQualityChecker", id),
    );
    const grouped = groupAiDefinitions(definitions);
    expect(grouped.visual).toHaveLength(5);
    expect(grouped.content).toHaveLength(3);
  });

  it("falls back to handler-based grouping for unknown ids", () => {
    expect(
      resolveAiBatchGroup(aiDefinition("unknown", "homepageHeroChecker", "hero")),
    ).toBe("visual");
    expect(
      resolveAiBatchGroup(aiDefinition("unknown", "contentQualityChecker", "content")),
    ).toBe("content");
  });
});
