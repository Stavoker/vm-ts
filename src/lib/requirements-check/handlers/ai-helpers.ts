import {
  buildAiReviewBatchItem,
  fetchHomepageExcerpt,
  runBatchedAiReviews,
  runDualBatchedAiReviews,
  type AiReviewResponse,
} from "../external/openai-review";
import { getScanExternal } from "../external/scan-cache";
import type { RequirementCheckResult, RequirementDefinition, ScanContext } from "../types";
import { groupAiDefinitions, resolveAiBatchGroup } from "./ai-batch-groups";
import { manual } from "./shared";

export { AI_REQUIREMENT_BATCH_GROUP, resolveAiBatchGroup } from "./ai-batch-groups";

export const AI_REVIEW_HANDLERS = new Set([
  "aiReviewChecker",
  "homepageHeroChecker",
  "contentQualityChecker",
  "websiteSimilarityChecker",
]);

const AI_BATCH_CACHE_KEY = "ai-batch-reviews";
const HOMEPAGE_EXCERPT_CACHE_KEY = "homepage-html-excerpt";

function reviewToResult(
  definition: RequirementDefinition,
  context: ScanContext,
  review: AiReviewResponse,
): RequirementCheckResult {
  const base = {
    requirementId: definition.id,
    status: review.status,
    explanation: review.explanation,
    confidence: review.confidence,
    checkedUrl: context.websiteUrl,
    handlerUsed: definition.automationHandler,
    completedAt: new Date().toISOString(),
    evidence: {
      url: context.websiteUrl,
      confidence: review.confidence,
      timestamp: new Date().toISOString(),
    },
  };

  if (review.status === "PASS" || review.status === "FAIL") {
    return base;
  }

  return manual(definition, review.explanation, {
    confidence: review.confidence,
    checkedUrl: context.websiteUrl,
    evidence: base.evidence,
  });
}

export async function ensureBatchedAiReviews(
  definitions: RequirementDefinition[],
  context: ScanContext,
): Promise<void> {
  const aiDefinitions = definitions.filter((definition) =>
    AI_REVIEW_HANDLERS.has(definition.automationHandler),
  );
  if (aiDefinitions.length === 0) return;

  await getScanExternal(context, AI_BATCH_CACHE_KEY, async () => {
    const htmlExcerpt = await getScanExternal(context, HOMEPAGE_EXCERPT_CACHE_KEY, () =>
      fetchHomepageExcerpt(context.websiteUrl, 12_000),
    );
    const groups = groupAiDefinitions(aiDefinitions);

    return runDualBatchedAiReviews({
      websiteUrl: context.websiteUrl,
      htmlExcerpt,
      screenshotBase64: context.homepageScreenshotBase64,
      visualRequirements: groups.visual.map((definition) =>
        buildAiReviewBatchItem(
          definition.id,
          definition.originalName,
          definition.automationHandler,
        ),
      ),
      contentRequirements: groups.content.map((definition) =>
        buildAiReviewBatchItem(
          definition.id,
          definition.originalName,
          definition.automationHandler,
        ),
      ),
    });
  });
}

export async function runDefinitionAiReview(
  definition: RequirementDefinition,
  context: ScanContext,
  extraPrompt?: string,
): Promise<RequirementCheckResult> {
  if (!AI_REVIEW_HANDLERS.has(definition.automationHandler)) {
    return manual(definition, "This requirement is not configured for AI review.");
  }

  const batch =
    (context.externalCache?.get(AI_BATCH_CACHE_KEY) as Map<string, AiReviewResponse> | undefined) ||
    null;

  if (batch?.has(definition.id)) {
    return reviewToResult(definition, context, batch.get(definition.id)!);
  }

  const batchGroup = resolveAiBatchGroup(definition);
  const htmlExcerpt = await getScanExternal(context, HOMEPAGE_EXCERPT_CACHE_KEY, () =>
    fetchHomepageExcerpt(context.websiteUrl, 12_000),
  );
  const singleBatch = await runBatchedAiReviews({
    websiteUrl: context.websiteUrl,
    htmlExcerpt,
    screenshotBase64: batchGroup === "visual" ? context.homepageScreenshotBase64 : null,
    requirements: [
      buildAiReviewBatchItem(
        definition.id,
        definition.originalName,
        definition.automationHandler,
        extraPrompt,
      ),
    ],
    batchGroup,
    htmlExcerptLimit: batchGroup === "content" ? 12_000 : 6_000,
  });

  const review =
    singleBatch.get(definition.id) ||
    ({
      status: "MANUAL",
      confidence: 0,
      explanation: "AI review failed.",
    } satisfies AiReviewResponse);

  return reviewToResult(definition, context, review);
}
