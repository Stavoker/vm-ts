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
import { buildBusinessPlanExcerpt, buildSiteContentExcerpt } from "./business-plan";
import { manual } from "./shared";
import { buildKybLegalExcerpt } from "./website-kyb";

export { AI_REQUIREMENT_BATCH_GROUP, resolveAiBatchGroup } from "./ai-batch-groups";

export const AI_REVIEW_HANDLERS = new Set([
  "aiReviewChecker",
  "homepageHeroChecker",
  "contentQualityChecker",
  "websiteSimilarityChecker",
  "kybVisibilityChecker",
  "businessPlanAiChecker",
  "logoChecker",
  "socialMediaChecker",
  "contactFormChecker",
  "productDescriptionChecker",
  "reviewsChecker",
  "paymentLogoChecker",
]);

const AI_BATCH_CACHE_KEY = "ai-batch-reviews";
const HOMEPAGE_EXCERPT_CACHE_KEY = "homepage-html-excerpt";
const SITE_CONTENT_EXCERPT_CACHE_KEY = "site-content-excerpt";
const KYB_EXCERPT_CACHE_KEY = "kyb-legal-excerpt";
const BUSINESS_EXCERPT_CACHE_KEY = "business-plan-excerpt";

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

async function resolveBatchExcerpt(
  batchGroup: ReturnType<typeof resolveAiBatchGroup>,
  context: ScanContext,
): Promise<string> {
  switch (batchGroup) {
    case "kyb":
      return getScanExternal(context, KYB_EXCERPT_CACHE_KEY, () =>
        Promise.resolve(buildKybLegalExcerpt(context)),
      );
    case "business":
      return getScanExternal(context, BUSINESS_EXCERPT_CACHE_KEY, () =>
        Promise.resolve(buildBusinessPlanExcerpt(context)),
      );
    case "content":
      return getScanExternal(context, SITE_CONTENT_EXCERPT_CACHE_KEY, () =>
        Promise.resolve(buildSiteContentExcerpt(context)),
      );
    default:
      return getScanExternal(context, HOMEPAGE_EXCERPT_CACHE_KEY, () =>
        fetchHomepageExcerpt(context.websiteUrl, 12_000),
      );
  }
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
    const siteContentExcerpt = await getScanExternal(context, SITE_CONTENT_EXCERPT_CACHE_KEY, () =>
      Promise.resolve(buildSiteContentExcerpt(context)),
    );
    const kybExcerpt = await getScanExternal(context, KYB_EXCERPT_CACHE_KEY, () =>
      Promise.resolve(buildKybLegalExcerpt(context)),
    );
    const businessExcerpt = await getScanExternal(context, BUSINESS_EXCERPT_CACHE_KEY, () =>
      Promise.resolve(buildBusinessPlanExcerpt(context)),
    );
    const groups = groupAiDefinitions(aiDefinitions);

    return runDualBatchedAiReviews({
      websiteUrl: context.websiteUrl,
      htmlExcerpt: siteContentExcerpt || htmlExcerpt,
      kybHtmlExcerpt: kybExcerpt,
      businessHtmlExcerpt: businessExcerpt,
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
      kybRequirements: groups.kyb.map((definition) =>
        buildAiReviewBatchItem(
          definition.id,
          definition.originalName,
          definition.automationHandler,
        ),
      ),
      businessRequirements: groups.business.map((definition) =>
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
  const htmlExcerpt = await resolveBatchExcerpt(batchGroup, context);
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
    htmlExcerptLimit:
      batchGroup === "content"
        ? 16_000
        : batchGroup === "kyb" || batchGroup === "business"
          ? 20_000
          : 6_000,
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
