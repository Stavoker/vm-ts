const MODEL_RATES_USD: Record<string, { inputPerM: number; outputPerM: number }> = {
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
};

/** Conservative high-detail vision estimate for 1365×900 screenshots. */
const IMAGE_INPUT_TOKENS: Record<string, number> = {
  "gpt-4o": 1_200,
  "gpt-4o-mini": 37_000,
};

export function resolveOpenAiVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o";
}

export function resolveOpenAiTextModel(): string {
  return process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || "gpt-4o";
}

export function getOpenAiMaxCostPerScanUsd(): number {
  const raw = process.env.OPENAI_MAX_COST_PER_SCAN_USD;
  const parsed = raw ? Number(raw) : 3;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

export function estimateOpenAiCallCostUsd(input: {
  model: string;
  textInputTokens: number;
  outputTokens?: number;
  includeImage?: boolean;
}): number {
  const rates = MODEL_RATES_USD[input.model] || MODEL_RATES_USD["gpt-4o-mini"];
  const imageTokens =
    input.includeImage && IMAGE_INPUT_TOKENS[input.model]
      ? IMAGE_INPUT_TOKENS[input.model]
      : input.includeImage
        ? IMAGE_INPUT_TOKENS["gpt-4o-mini"]
        : 0;
  const totalInput = input.textInputTokens + imageTokens;
  const output = input.outputTokens ?? 1_500;
  return (
    (totalInput / 1_000_000) * rates.inputPerM + (output / 1_000_000) * rates.outputPerM
  );
}
