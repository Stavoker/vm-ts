import {
  estimateOpenAiCallCostUsd,
  getOpenAiMaxCostPerScanUsd,
  resolveOpenAiTextModel,
  resolveOpenAiVisionModel,
} from "./openai-cost";
import type { RequirementResultStatus } from "../types";

export type AiReviewResponse = {
  status: RequirementResultStatus;
  confidence: number;
  explanation: string;
};

export type AiReviewBatchItem = {
  requirementId: string;
  requirementName: string;
  focusHint?: string;
};

export type AiReviewBatchGroup = "visual" | "content";

type AiReviewInput = {
  requirementName: string;
  websiteUrl: string;
  htmlExcerpt?: string;
  screenshotBase64?: string | null;
  extraPrompt?: string;
};

type RunBatchedAiReviewsInput = {
  websiteUrl: string;
  htmlExcerpt: string;
  screenshotBase64?: string | null;
  requirements: AiReviewBatchItem[];
  batchGroup: AiReviewBatchGroup;
  model?: string;
  maxCostUsd?: number;
  htmlExcerptLimit?: number;
};

const AI_HANDLER_HINTS: Record<string, string> = {
  homepageHeroChecker:
    "Focus on the homepage hero area. Confirm there is one single main image and no carousel/slider with multiple hero images.",
  contentQualityChecker:
    "Review text quality for uniqueness, clarity, and grammar across visible homepage content.",
  websiteSimilarityChecker:
    "No comparison sites are available. Judge whether the site looks template-derived or materially differentiated in structure, text, palette, and tone.",
};

function buildBatchSystemPrompt(batchGroup: AiReviewBatchGroup): string {
  const evidenceHint =
    batchGroup === "visual"
      ? "Evaluate each requirement using the homepage screenshot and HTML excerpt."
      : "Evaluate each requirement using the HTML text excerpt only (no screenshot in this batch).";

  return [
    "You are a website compliance reviewer for payment-gateway onboarding.",
    evidenceHint,
    "Return strict JSON only:",
    '{"reviews":[{"requirementId":"...","status":"PASS"|"MANUAL"|"FAIL","confidence":0.0-1.0,"explanation":"..."}]}',
    "Use PASS only when evidence clearly supports compliance.",
    "Use MANUAL when evidence is insufficient or judgment is subjective.",
    "Use FAIL only when clear non-compliance is visible.",
    "Include one review object per requirement id provided.",
  ].join("\n");
}

function normalizeReview(parsed: {
  status?: RequirementResultStatus;
  confidence?: number;
  explanation?: string;
}): AiReviewResponse {
  const status =
    parsed.status === "PASS" || parsed.status === "FAIL" ? parsed.status : "MANUAL";
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

  if (confidence < 0.55 && status !== "FAIL") {
    return {
      status: "MANUAL",
      confidence,
      explanation: parsed.explanation || "AI confidence too low for automatic verdict.",
    };
  }

  return {
    status,
    confidence,
    explanation: parsed.explanation || "AI review completed.",
  };
}

function manualReview(explanation: string): AiReviewResponse {
  return { status: "MANUAL", confidence: 0, explanation };
}

export async function fetchHomepageExcerpt(url: string, maxLength = 12_000): Promise<string> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "VitrinaRequirementsCheck/1.0" },
    });
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  } catch {
    return "";
  }
}

function resolveBatchModel(batchGroup: AiReviewBatchGroup, explicitModel?: string): string {
  if (explicitModel) return explicitModel;
  return batchGroup === "visual" ? resolveOpenAiVisionModel() : resolveOpenAiTextModel();
}

export async function runBatchedAiReviews(input: RunBatchedAiReviewsInput): Promise<Map<string, AiReviewResponse>> {
  const results = new Map<string, AiReviewResponse>();
  for (const item of input.requirements) {
    results.set(item.requirementId, manualReview("AI review pending."));
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const message = "OPENAI_API_KEY is not configured.";
    for (const item of input.requirements) {
      results.set(item.requirementId, manualReview(message));
    }
    return results;
  }

  if (input.requirements.length === 0) {
    return results;
  }

  const includeImage = input.batchGroup === "visual" && Boolean(input.screenshotBase64);
  const model = resolveBatchModel(input.batchGroup, input.model);
  const excerptLimit = input.htmlExcerptLimit ?? (input.batchGroup === "content" ? 12_000 : 6_000);
  const requirementBlock = input.requirements
    .map(
      (item, index) =>
        `${index + 1}. id=${item.requirementId}\n   requirement=${item.requirementName}${item.focusHint ? `\n   focus=${item.focusHint}` : ""}`,
    )
    .join("\n");

  const userText = [
    `Website: ${input.websiteUrl}`,
    `Review batch: ${input.batchGroup}`,
    "Requirements to evaluate:",
    requirementBlock,
    input.htmlExcerpt
      ? `HTML excerpt:\n${input.htmlExcerpt.slice(0, excerptLimit)}`
      : "No HTML excerpt available.",
  ].join("\n\n");

  const estimatedCost = estimateOpenAiCallCostUsd({
    model,
    textInputTokens: Math.ceil(userText.length / 4) + 300,
    includeImage,
    outputTokens: input.batchGroup === "content" ? 2_000 : 1_500,
  });
  const maxCost = input.maxCostUsd ?? getOpenAiMaxCostPerScanUsd();
  if (estimatedCost > maxCost) {
    const message = `AI ${input.batchGroup} review skipped: estimated cost $${estimatedCost.toFixed(2)} exceeds remaining budget $${maxCost.toFixed(2)}.`;
    for (const item of input.requirements) {
      results.set(item.requirementId, manualReview(message));
    }
    return results;
  }

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "high" } }
  > = [{ type: "text", text: userText }];

  if (includeImage && input.screenshotBase64) {
    userContent.push({
      type: "image_url",
      image_url: { url: input.screenshotBase64, detail: "high" },
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildBatchSystemPrompt(input.batchGroup) },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    if (!response.ok) {
      const message = data.error?.message || `OpenAI HTTP ${response.status}`;
      for (const item of input.requirements) {
        results.set(item.requirementId, manualReview(message));
      }
      return results;
    }

    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      for (const item of input.requirements) {
        results.set(item.requirementId, manualReview("OpenAI returned an empty response."));
      }
      return results;
    }

    const parsed = JSON.parse(raw) as {
      reviews?: Array<{
        requirementId?: string;
        status?: RequirementResultStatus;
        confidence?: number;
        explanation?: string;
      }>;
    };

    const byId = new Map<string, AiReviewResponse>();
    for (const review of parsed.reviews || []) {
      if (!review.requirementId) continue;
      byId.set(review.requirementId, normalizeReview(review));
    }

    for (const item of input.requirements) {
      results.set(
        item.requirementId,
        byId.get(item.requirementId) ||
          manualReview("AI batch response did not include this requirement."),
      );
    }

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI batch review failed";
    for (const item of input.requirements) {
      results.set(item.requirementId, manualReview(message));
    }
    return results;
  }
}

export async function runDualBatchedAiReviews(input: {
  websiteUrl: string;
  htmlExcerpt: string;
  screenshotBase64?: string | null;
  visualRequirements: AiReviewBatchItem[];
  contentRequirements: AiReviewBatchItem[];
}): Promise<Map<string, AiReviewResponse>> {
  const merged = new Map<string, AiReviewResponse>();
  const maxCost = getOpenAiMaxCostPerScanUsd();
  let remainingBudget = maxCost;

  const visualEstimate =
    input.visualRequirements.length > 0
      ? estimateOpenAiCallCostUsd({
          model: resolveOpenAiVisionModel(),
          textInputTokens: 3_000,
          includeImage: Boolean(input.screenshotBase64),
        })
      : 0;
  const contentEstimate =
    input.contentRequirements.length > 0
      ? estimateOpenAiCallCostUsd({
          model: resolveOpenAiTextModel(),
          textInputTokens: 5_000,
          includeImage: false,
          outputTokens: 2_000,
        })
      : 0;

  if (visualEstimate + contentEstimate > maxCost) {
    const message = `AI review skipped: combined estimated cost $${(visualEstimate + contentEstimate).toFixed(2)} exceeds scan budget $${maxCost.toFixed(2)}.`;
    for (const item of [...input.visualRequirements, ...input.contentRequirements]) {
      merged.set(item.requirementId, manualReview(message));
    }
    return merged;
  }

  if (input.visualRequirements.length > 0) {
    const visual = await runBatchedAiReviews({
      websiteUrl: input.websiteUrl,
      htmlExcerpt: input.htmlExcerpt,
      screenshotBase64: input.screenshotBase64,
      requirements: input.visualRequirements,
      batchGroup: "visual",
      maxCostUsd: remainingBudget,
      htmlExcerptLimit: 6_000,
    });
    for (const [id, review] of visual) merged.set(id, review);
    remainingBudget = Math.max(0, remainingBudget - visualEstimate);
  }

  if (input.contentRequirements.length > 0) {
    const content = await runBatchedAiReviews({
      websiteUrl: input.websiteUrl,
      htmlExcerpt: input.htmlExcerpt,
      screenshotBase64: null,
      requirements: input.contentRequirements,
      batchGroup: "content",
      maxCostUsd: remainingBudget,
      htmlExcerptLimit: 12_000,
    });
    for (const [id, review] of content) merged.set(id, review);
  }

  return merged;
}

export function buildAiReviewBatchItem(
  requirementId: string,
  requirementName: string,
  automationHandler: string,
  extraPrompt?: string,
): AiReviewBatchItem {
  return {
    requirementId,
    requirementName,
    focusHint: extraPrompt || AI_HANDLER_HINTS[automationHandler],
  };
}

/** Legacy single-requirement path kept as fallback. */
export async function runAiReview(input: AiReviewInput): Promise<AiReviewResponse> {
  const batch = await runBatchedAiReviews({
    websiteUrl: input.websiteUrl,
    htmlExcerpt: input.htmlExcerpt || "",
    screenshotBase64: input.screenshotBase64,
    requirements: [
      buildAiReviewBatchItem("single", input.requirementName, "aiReviewChecker", input.extraPrompt),
    ],
    batchGroup: "visual",
  });
  return batch.get("single") || manualReview("AI review failed.");
}
