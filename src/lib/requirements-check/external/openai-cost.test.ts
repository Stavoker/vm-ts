import { describe, expect, it } from "vitest";
import {
  estimateOpenAiCallCostUsd,
  getOpenAiMaxCostPerScanUsd,
  resolveOpenAiTextModel,
  resolveOpenAiVisionModel,
} from "@/lib/requirements-check/external/openai-cost";

describe("openai cost guardrails", () => {
  it("defaults vision model to gpt-4o for accuracy", () => {
    const previousVision = process.env.OPENAI_VISION_MODEL;
    const previousModel = process.env.OPENAI_MODEL;
    delete process.env.OPENAI_VISION_MODEL;
    delete process.env.OPENAI_MODEL;
    expect(resolveOpenAiVisionModel()).toBe("gpt-4o");
    process.env.OPENAI_VISION_MODEL = previousVision;
    process.env.OPENAI_MODEL = previousModel;
  });

  it("defaults scan budget to 3 USD", () => {
    const previous = process.env.OPENAI_MAX_COST_PER_SCAN_USD;
    delete process.env.OPENAI_MAX_COST_PER_SCAN_USD;
    expect(getOpenAiMaxCostPerScanUsd()).toBe(3);
    process.env.OPENAI_MAX_COST_PER_SCAN_USD = previous;
  });

  it("estimates dual-batch gpt-4o scan well below 3 USD", () => {
    const visual = estimateOpenAiCallCostUsd({
      model: resolveOpenAiVisionModel(),
      textInputTokens: 3_000,
      outputTokens: 1_500,
      includeImage: true,
    });
    const content = estimateOpenAiCallCostUsd({
      model: resolveOpenAiTextModel(),
      textInputTokens: 5_000,
      outputTokens: 2_000,
      includeImage: false,
    });
    expect(visual + content).toBeLessThan(0.05);
    expect(visual + content).toBeLessThan(getOpenAiMaxCostPerScanUsd());
  });
});
