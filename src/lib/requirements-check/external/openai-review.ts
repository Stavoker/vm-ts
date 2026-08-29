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

export type AiReviewBatchGroup = "visual" | "content" | "kyb" | "business";

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

const AI_REQUIREMENT_HINTS: Record<string, string> = {
  tax_country:
    "Identify tax country, jurisdiction, VAT country, or country of incorporation from legal/footer content.",
  industry_nature_of_business:
    "Identify industry, business nature, products, or services from about/legal/homepage content.",
  business_model_clearly_described:
    "Check whether the public website explains how the company makes money (SaaS, credits, subscriptions, etc.).",
  products_services_clearly_described:
    "Check whether products/services are clearly described on the website.",
  target_audience_documented:
    "Check whether target customers or audience are described on the website.",
  target_countries_business_geography_documented:
    "Check whether target countries, regions, or business geography are mentioned.",
  customer_acquisition_marketing_channels_documented:
    "Check whether marketing or customer acquisition channels are described.",
  supplier_counterparty_structure_documented:
    "Check whether suppliers, partners, or counterparties are mentioned if relevant.",
  business_plan_if_required_by_provider:
    "Treat a clear public website business description as sufficient; do not require an uploaded PDF.",
  business_plan_includes_month_year_of_preparation:
    "PASS if any current date/year on the site suggests active operations; otherwise MANUAL.",
  business_plan_includes_team_size_roles_and_reporting_lines:
    "PASS if team/about/company pages mention roles or team structure.",
  business_plan_includes_first_year_monthly_or_quarterly_finan:
    "PASS only if financial forecast or revenue projections appear on the site; otherwise MANUAL.",
  forecast_revenue_is_consistent_with_requested_processing_lim:
    "PASS if pricing/revenue model on site appears plausible; MANUAL if no numbers.",
  average_ticket_is_consistent_with_expected_traffic:
    "PASS if pricing tiers or average purchase/top-up amounts are visible on the site.",
  marketing_strategy_is_described:
    "PASS if marketing approach, channels, or go-to-market content is described.",
  current_project_status_documented_e_g_pre_launch_initial_pha:
    "PASS if the site indicates live product, beta, launch status, or current phase.",
  no_low_quality_stock_imagery_images_or_logos:
    "Use the homepage screenshot to judge whether imagery/logos look low-quality or generic stock.",
  ensure_all_logos_are_unique_for_each_website_legally_used_an:
    "Review logos/branding in the screenshot for uniqueness and professional quality.",
  upload_the_website_logo:
    "Inspect header/branding in the full-page homepage screenshot. PASS if a logo image OR text/wordmark brand name is visible (text logos count). FAIL only if no branding at all.",
  link_all_active_social_media_handles_to_the_website:
    "Inspect the footer and header in the screenshot for social network icons/links (Facebook, Instagram, X/Twitter, LinkedIn, YouTube, TikTok). PASS if at least one is visible. FAIL if none visible. Do not PASS from privacy-policy text alone.",
  contact_form_available:
    "Look for a contact form, support email/mailto link, help page CTA, or live chat widget in the screenshot/HTML. PASS if users can reach support by form, email, or chat. FAIL only if no contact path is visible.",
  ensure_all_products_have_complete_descriptions:
    "For SaaS/digital products, feature/pricing/credits pages count as product descriptions. PASS if services and what is sold are clearly described on the site. FAIL if offerings are unclear.",
  add_customer_reviews_testimonials_and_ratings:
    "Look for testimonial sections, customer quotes, or star ratings in the screenshot. FAIL/MANUAL if none; do not confuse app UI like 'review document' with customer reviews.",
  add_visa_latest_and_mastercard_logos_in_the_footer_or_paymen:
    "Check footer/payment areas in the screenshot for Visa/Mastercard marks. PASS if both visible, MANUAL if optional and absent.",
  prices_are_market_consistent_for_the_industry_and_commercial:
    "PASS when pricing/credits/packages are visible and commercially plausible for a SaaS/digital service. Do not require external industry benchmarks. FAIL only if pricing is absent or clearly absurd.",
};

const AI_HANDLER_HINTS: Record<string, string> = {
  homepageHeroChecker:
    "Focus on the homepage hero area. Confirm there is one single main image and no carousel/slider with multiple hero images.",
  contentQualityChecker:
    "Review text quality for uniqueness, clarity, and grammar across visible homepage content.",
  websiteSimilarityChecker:
    "No comparison sites are available. Judge whether the site looks template-derived or materially differentiated in structure, text, palette, and tone.",
  kybVisibilityChecker:
    "Review legal, footer, about, and contact excerpts for company jurisdiction and business nature.",
  businessPlanAiChecker:
    "Review public website pages (homepage, features, pricing, about) as the business plan source. PASS when the topic is clearly described and not placeholder text.",
  aiReviewChecker:
    "Use website-visible evidence only. PASS when clearly supported; do not require uploaded documents.",
  logoChecker:
    "Use the full-page homepage screenshot. Text/wordmark branding in header counts as a logo.",
  socialMediaChecker:
    "Use the screenshot footer/header to verify social icons/links visually, not just HTML text mentions.",
  contactFormChecker:
    "Accept contact forms, support email links, help CTAs, or chat widgets as contact availability.",
  productDescriptionChecker:
    "Treat SaaS features/pricing/credits pages as product/service descriptions.",
  reviewsChecker:
    "Look for customer testimonials/review sections in the screenshot, not in-app review buttons.",
};

function buildBatchSystemPrompt(batchGroup: AiReviewBatchGroup): string {
  const evidenceHint =
    batchGroup === "visual"
      ? "Evaluate each requirement using the homepage screenshot and HTML excerpt."
      : batchGroup === "kyb"
        ? "Evaluate each requirement using company/legal/footer page text excerpts."
        : batchGroup === "business"
          ? "Evaluate each requirement using public website marketing/about/pricing/features text. Treat the website as the business plan source."
          : "Evaluate each requirement using the HTML text excerpt only (no screenshot in this batch).";

  return [
    "You are a website compliance reviewer for payment-gateway onboarding.",
    evidenceHint,
    "Return strict JSON only:",
    '{"reviews":[{"requirementId":"...","status":"PASS"|"MANUAL"|"FAIL","confidence":0.0-1.0,"explanation":"..."}]}',
    "Prefer PASS or FAIL based on visible website evidence. Use MANUAL only when the screenshot/HTML truly cannot decide.",
    "For visual checks: inspect header, footer, hero, and pricing areas in the screenshot. Mention the exact area used (e.g. footer, header).",
    "Text/wordmark logos count as logos. Footer social icons count if visible. SaaS credits/pricing count as product descriptions.",
    "Use FAIL when the requirement is clearly missing from the public website.",
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
  const excerptLimit =
    input.htmlExcerptLimit ??
    (input.batchGroup === "content"
      ? 16_000
      : input.batchGroup === "kyb" || input.batchGroup === "business"
        ? 20_000
        : 6_000);
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
  kybHtmlExcerpt?: string;
  businessHtmlExcerpt?: string;
  screenshotBase64?: string | null;
  visualRequirements: AiReviewBatchItem[];
  contentRequirements: AiReviewBatchItem[];
  kybRequirements?: AiReviewBatchItem[];
  businessRequirements?: AiReviewBatchItem[];
}): Promise<Map<string, AiReviewResponse>> {
  const merged = new Map<string, AiReviewResponse>();
  const maxCost = getOpenAiMaxCostPerScanUsd();
  let remainingBudget = maxCost;
  const kybRequirements = input.kybRequirements || [];
  const businessRequirements = input.businessRequirements || [];

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
          textInputTokens: 6_000,
          includeImage: false,
          outputTokens: 2_000,
        })
      : 0;
  const kybEstimate =
    kybRequirements.length > 0
      ? estimateOpenAiCallCostUsd({
          model: resolveOpenAiTextModel(),
          textInputTokens: 6_000,
          includeImage: false,
          outputTokens: 1_500,
        })
      : 0;
  const businessEstimate =
    businessRequirements.length > 0
      ? estimateOpenAiCallCostUsd({
          model: resolveOpenAiTextModel(),
          textInputTokens: 8_000,
          includeImage: false,
          outputTokens: 2_500,
        })
      : 0;

  if (visualEstimate + contentEstimate + kybEstimate + businessEstimate > maxCost) {
    const message = `AI review skipped: combined estimated cost $${(visualEstimate + contentEstimate + kybEstimate + businessEstimate).toFixed(2)} exceeds scan budget $${maxCost.toFixed(2)}.`;
    for (const item of [
      ...input.visualRequirements,
      ...input.contentRequirements,
      ...kybRequirements,
      ...businessRequirements,
    ]) {
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
    remainingBudget = Math.max(0, remainingBudget - contentEstimate);
  }

  if (kybRequirements.length > 0) {
    const kyb = await runBatchedAiReviews({
      websiteUrl: input.websiteUrl,
      htmlExcerpt: input.kybHtmlExcerpt || input.htmlExcerpt,
      screenshotBase64: null,
      requirements: kybRequirements,
      batchGroup: "kyb",
      maxCostUsd: remainingBudget,
      htmlExcerptLimit: 16_000,
    });
    for (const [id, review] of kyb) merged.set(id, review);
    remainingBudget = Math.max(0, remainingBudget - kybEstimate);
  }

  if (businessRequirements.length > 0) {
    const business = await runBatchedAiReviews({
      websiteUrl: input.websiteUrl,
      htmlExcerpt: input.businessHtmlExcerpt || input.htmlExcerpt,
      screenshotBase64: null,
      requirements: businessRequirements,
      batchGroup: "business",
      maxCostUsd: remainingBudget,
      htmlExcerptLimit: 20_000,
    });
    for (const [id, review] of business) merged.set(id, review);
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
    focusHint: extraPrompt || AI_REQUIREMENT_HINTS[requirementId] || AI_HANDLER_HINTS[automationHandler],
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
