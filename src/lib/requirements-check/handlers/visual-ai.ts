import type { RequirementCheckResult, RequirementDefinition, ScanContext } from "../types";
import { runDefinitionAiReview } from "./ai-helpers";
import { fail, getPageSnapshot, pass } from "./shared";
import { scanCustomerReviews, scanSocialMediaLinks } from "./social-reviews";

function homepageUrl(context: ScanContext): string {
  return context.pages.find((page) => page.pageType === "homepage")?.url || context.websiteUrl;
}

function formatPages(pages: string[], max = 4): string {
  if (pages.length === 0) return "homepage";
  return pages.slice(0, max).join(", ");
}

export function detectTextOrImageLogo(context: ScanContext): RequirementCheckResult | null {
  const url = homepageUrl(context);
  const snapshot = getPageSnapshot(context, url);
  if (!snapshot) return null;

  const hay = `${snapshot.html || ""}\n${snapshot.visibleText || ""}`;
  const headerMatch = hay.match(/<header[\s\S]*?<\/header>/i)?.[0] || hay.slice(0, 2500);
  const brandHint =
    snapshot.title?.split(/[|\-–]/)[0]?.trim() ||
    context.hostname.replace(/^www\./i, "").split(".")[0];

  const hasImageLogo =
    /<img[^>]+(?:logo|brand)/i.test(headerMatch) ||
    /class=["'][^"']*logo/i.test(headerMatch) ||
    /alt=["'][^"']*(logo|brand)/i.test(headerMatch);

  const hasTextLogo =
    Boolean(brandHint && brandHint.length >= 3 && new RegExp(`\\b${brandHint}\\b`, "i").test(headerMatch)) ||
    /<header[\s\S]*?(?:<a|<span|<div)[^>]*class=["'][^"']*(?:logo|brand)/i.test(headerMatch);

  if (hasImageLogo || hasTextLogo) {
    return pass(
      { id: "upload_the_website_logo", automationHandler: "logoChecker" } as RequirementDefinition,
      [
        hasImageLogo
          ? `Logo image/brand mark detected in homepage header (${url}).`
          : `Text/wordmark logo "${brandHint}" detected in homepage header (${url}).`,
        "Confirmed from browser-rendered homepage after scroll.",
      ].join(" "),
      { checkedUrl: url },
    );
  }

  return null;
}

export function detectContactChannel(context: ScanContext): RequirementCheckResult | null {
  for (const page of context.pages) {
    if (!/(contact|support|help)/i.test(`${page.url} ${page.title || ""}`) && page.pageType !== "homepage") {
      continue;
    }
    const snapshot = getPageSnapshot(context, page.url);
    const hay = `${snapshot?.html || ""}\n${snapshot?.visibleText || ""}`;
    const hasForm =
      /<form[\s\S]*?<\/form>/i.test(hay) && /(email|message|name|phone|subject)/i.test(hay);
    const hasMailto = /mailto:[^"'\s]+@[^"'\s]+/i.test(hay);
    const hasChat = /chatbot|live chat|intercom|crisp|tawk|zendesk|support widget/i.test(hay);
    const hasSupportEmail =
      /(?:support|contact|help)@[a-z0-9.-]+\.[a-z]{2,}/i.test(hay) ||
      /(?:support|contact us|get in touch|email us)/i.test(snapshot?.visibleText || "");

    if (hasForm) {
      return pass(
        { id: "contact_form_available", automationHandler: "contactFormChecker" } as RequirementDefinition,
        `Contact form fields detected on ${page.url}.`,
        { checkedUrl: page.url },
      );
    }
    if (hasMailto || hasChat || hasSupportEmail) {
      return pass(
        { id: "contact_form_available", automationHandler: "contactFormChecker" } as RequirementDefinition,
        [
          hasMailto ? `Support email link detected on ${page.url}.` : "",
          hasSupportEmail ? `Support/contact email or CTA detected on ${page.url}.` : "",
          hasChat ? `Live chat/support widget indicators detected on ${page.url}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        { checkedUrl: page.url },
      );
    }
  }
  return null;
}

export function detectProductOrServiceDescriptions(
  context: ScanContext,
): RequirementCheckResult | null {
  const candidates = context.pages.filter((page) =>
    /features|pricing|product|services|platform|ai-writer|top-up|credits|how-it-works|solutions/i.test(
      `${page.url} ${page.title || ""} ${page.pageType || ""}`,
    ),
  );

  const described = candidates.filter((page) => {
    const snapshot = getPageSnapshot(context, page.url);
    return countWords(snapshot?.visibleText || "") >= 80;
  });

  if (described.length === 0) return null;

  return pass(
    {
      id: "ensure_all_products_have_complete_descriptions",
      automationHandler: "productDescriptionChecker",
    } as RequirementDefinition,
    [
      `Service/product descriptions found on ${described.length} page(s): ${described
        .slice(0, 4)
        .map((page) => page.url)
        .join(", ")}.`,
      "SaaS feature/pricing pages count as product descriptions.",
    ].join(" "),
    { checkedUrl: described[0]?.url },
  );
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function socialHeuristic(context: ScanContext): RequirementCheckResult | null {
  const { hits, checkedPages } = scanSocialMediaLinks(context);
  if (hits.length === 0) return null;
  return pass(
    {
      id: "link_all_active_social_media_handles_to_the_website",
      automationHandler: "socialMediaChecker",
    } as RequirementDefinition,
    `Social links confirmed in HTML on ${hits.map((hit) => `${hit.network} (${hit.pageUrl})`).join(", ")}. Checked: ${checkedPages.slice(0, 4).join(", ")}.`,
    { checkedUrl: hits[0]?.pageUrl },
  );
}

function reviewsHeuristic(context: ScanContext): RequirementCheckResult | null {
  const { hits, checkedPages } = scanCustomerReviews(context);
  if (hits.length === 0) return null;
  return pass(
    {
      id: "add_customer_reviews_testimonials_and_ratings",
      automationHandler: "reviewsChecker",
    } as RequirementDefinition,
    `Testimonials/reviews detected on ${hits.map((hit) => hit.pageUrl).join(", ")}. Checked: ${checkedPages.slice(0, 4).join(", ")}.`,
    { checkedUrl: hits[0]?.pageUrl },
  );
}

export type VisualAiOptions = {
  heuristic?: (context: ScanContext) => RequirementCheckResult | null;
  absenceFallback?: (
    definition: RequirementDefinition,
    context: ScanContext,
  ) => RequirementCheckResult;
};

export async function runVisualAiReview(
  definition: RequirementDefinition,
  context: ScanContext,
  options?: VisualAiOptions | ((context: ScanContext) => RequirementCheckResult | null),
): Promise<RequirementCheckResult> {
  const resolved: VisualAiOptions =
    typeof options === "function" ? { heuristic: options } : (options ?? {});

  const ai = await runDefinitionAiReview(definition, context);
  if (ai.status === "PASS" || ai.status === "FAIL") {
    return { ...ai, handlerUsed: definition.automationHandler };
  }

  const local = resolved.heuristic?.(context);
  if (local) {
    return { ...local, requirementId: definition.id, handlerUsed: definition.automationHandler };
  }

  if (resolved.absenceFallback) {
    return resolved.absenceFallback(definition, context);
  }

  if (ai.status === "MANUAL" && ai.explanation) {
    return {
      ...ai,
      handlerUsed: definition.automationHandler,
      explanation: `${ai.explanation} Checked homepage screenshot and public pages.`,
    };
  }

  return { ...ai, handlerUsed: definition.automationHandler };
}

export const visualHeuristics = {
  logoChecker: detectTextOrImageLogo,
  contactFormChecker: detectContactChannel,
  productDescriptionChecker: detectProductOrServiceDescriptions,
  socialMediaChecker: socialHeuristic,
  reviewsChecker: reviewsHeuristic,
};

export const visualAbsenceFallbacks = {
  logoChecker(definition: RequirementDefinition, context: ScanContext): RequirementCheckResult {
    const url = homepageUrl(context);
    return fail(
      definition,
      `No logo or text wordmark detected in the homepage header after browser scroll and screenshot review. Checked: ${url}.`,
      { checkedUrl: url },
    );
  },

  socialMediaChecker(definition: RequirementDefinition, context: ScanContext): RequirementCheckResult {
    const { checkedPages } = scanSocialMediaLinks(context);
    return fail(
      definition,
      [
        `Checked public pages (${checkedPages.length}): ${formatPages(checkedPages)}.`,
        "No social media icons or outbound links (Facebook, Instagram, X/Twitter, LinkedIn, YouTube, TikTok) visible in footer or header.",
      ].join(" "),
      { checkedUrl: checkedPages[0] || context.websiteUrl },
    );
  },

  reviewsChecker(definition: RequirementDefinition, context: ScanContext): RequirementCheckResult {
    const { checkedPages } = scanCustomerReviews(context);
    return fail(
      definition,
      [
        `Checked public marketing pages (${checkedPages.length}): ${formatPages(checkedPages)}.`,
        "No customer testimonials, review blocks, or star ratings detected on public pages.",
      ].join(" "),
      { checkedUrl: checkedPages[0] || context.websiteUrl },
    );
  },

  contactFormChecker(definition: RequirementDefinition, context: ScanContext): RequirementCheckResult {
    const url = homepageUrl(context);
    return fail(
      definition,
      `No contact form, support email, mailto link, or live chat widget detected on public pages. Checked: ${url}.`,
      { checkedUrl: url },
    );
  },

  productDescriptionChecker(
    definition: RequirementDefinition,
    context: ScanContext,
  ): RequirementCheckResult {
    const url = homepageUrl(context);
    return fail(
      definition,
      "No complete product or service descriptions found on features/pricing/credits pages after full-site scan.",
      { checkedUrl: url },
    );
  },

  paymentLogoChecker(definition: RequirementDefinition, context: ScanContext): RequirementCheckResult {
    const url = homepageUrl(context);
    return fail(
      definition,
      "Visa and Mastercard logos or payment marks were not found in footer or payment areas.",
      { checkedUrl: url },
    );
  },
};
