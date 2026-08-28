import type { RequirementDefinition } from "../types";

export type AiReviewBatchGroup = "visual" | "content";

/** Maps each AI requirement to visual (screenshot) or content (text) review batch. */
export const AI_REQUIREMENT_BATCH_GROUP: Record<string, AiReviewBatchGroup> = {
  use_a_clean_modern_ui_ux_design: "visual",
  homepage_must_have_one_single_main_image_no_sliders_or_multi: "visual",
  ensure_all_logos_are_unique_for_each_website_legally_used_an: "visual",
  no_low_quality_stock_imagery_images_or_logos: "visual",
  if_multiple_sites_use_the_same_template_they_are_materially_: "visual",
  all_website_content_must_be_unique_clear_and_grammatically_c: "content",
  no_excessive_chatgpt_ai_generated_text_use_minimal_or_natura: "content",
  prices_are_market_consistent_for_the_industry_and_commercial: "content",
};

const VISUAL_HANDLERS = new Set([
  "homepageHeroChecker",
  "websiteSimilarityChecker",
]);

const CONTENT_HANDLERS = new Set(["contentQualityChecker"]);

export function resolveAiBatchGroup(definition: RequirementDefinition): AiReviewBatchGroup {
  const mapped = AI_REQUIREMENT_BATCH_GROUP[definition.id];
  if (mapped) return mapped;
  if (VISUAL_HANDLERS.has(definition.automationHandler)) return "visual";
  if (CONTENT_HANDLERS.has(definition.automationHandler)) return "content";
  return "content";
}

export function groupAiDefinitions(
  definitions: RequirementDefinition[],
): Record<AiReviewBatchGroup, RequirementDefinition[]> {
  const groups: Record<AiReviewBatchGroup, RequirementDefinition[]> = {
    visual: [],
    content: [],
  };
  for (const definition of definitions) {
    groups[resolveAiBatchGroup(definition)].push(definition);
  }
  return groups;
}
