import type { RequirementDefinition } from "../types";

export type AiReviewBatchGroup = "visual" | "content" | "kyb" | "business";

/** Maps each AI requirement to visual, content, KYB, or business-plan review batch. */
export const AI_REQUIREMENT_BATCH_GROUP: Record<string, AiReviewBatchGroup> = {
  use_a_clean_modern_ui_ux_design: "visual",
  homepage_must_have_one_single_main_image_no_sliders_or_multi: "visual",
  ensure_all_logos_are_unique_for_each_website_legally_used_an: "visual",
  no_low_quality_stock_imagery_images_or_logos: "visual",
  if_multiple_sites_use_the_same_template_they_are_materially_: "visual",
  all_website_content_must_be_unique_clear_and_grammatically_c: "content",
  no_excessive_chatgpt_ai_generated_text_use_minimal_or_natura: "content",
  prices_are_market_consistent_for_the_industry_and_commercial: "content",
  industry_nature_of_business: "kyb",
  tax_country: "kyb",
  business_model_clearly_described: "business",
  products_services_clearly_described: "business",
  target_audience_documented: "business",
  target_countries_business_geography_documented: "business",
  customer_acquisition_marketing_channels_documented: "business",
  supplier_counterparty_structure_documented: "business",
  business_plan_if_required_by_provider: "business",
  business_plan_includes_month_year_of_preparation: "business",
  business_plan_includes_team_size_roles_and_reporting_lines: "business",
  business_plan_includes_first_year_monthly_or_quarterly_finan: "business",
  forecast_revenue_is_consistent_with_requested_processing_lim: "business",
  average_ticket_is_consistent_with_expected_traffic: "business",
  marketing_strategy_is_described: "business",
  current_project_status_documented_e_g_pre_launch_initial_pha: "business",
};

const VISUAL_HANDLERS = new Set([
  "homepageHeroChecker",
  "websiteSimilarityChecker",
]);

const CONTENT_HANDLERS = new Set(["contentQualityChecker"]);
const KYB_HANDLERS = new Set(["kybVisibilityChecker"]);
const BUSINESS_HANDLERS = new Set(["businessPlanAiChecker"]);

export function resolveAiBatchGroup(definition: RequirementDefinition): AiReviewBatchGroup {
  const mapped = AI_REQUIREMENT_BATCH_GROUP[definition.id];
  if (mapped) return mapped;
  if (VISUAL_HANDLERS.has(definition.automationHandler)) return "visual";
  if (BUSINESS_HANDLERS.has(definition.automationHandler)) return "business";
  if (KYB_HANDLERS.has(definition.automationHandler)) return "kyb";
  if (CONTENT_HANDLERS.has(definition.automationHandler)) return "content";
  return "content";
}

export function groupAiDefinitions(
  definitions: RequirementDefinition[],
): Record<AiReviewBatchGroup, RequirementDefinition[]> {
  const groups: Record<AiReviewBatchGroup, RequirementDefinition[]> = {
    visual: [],
    content: [],
    kyb: [],
    business: [],
  };
  for (const definition of definitions) {
    groups[resolveAiBatchGroup(definition)].push(definition);
  }
  return groups;
}
