import { analyzeSecurityHeaders } from "../external/security-headers";
import {
  cloudflareChecker,
  companyEmailRegistrationChecker,
  domainAgeChecker,
  domainOwnershipChecker,
  domainOwnershipProofChecker,
  domainRegistrarChecker,
  domainWhoisChecker,
  hostingFootprintChecker,
  reverseIpChecker,
  separateHostingChecker,
} from "./domain-handlers";
import { fetchPageSpeed } from "../external/pagespeed";
import { getScanExternal } from "../external/scan-cache";
import type {
  RequirementDefinition,
  RequirementHandler,
  ScanContext,
} from "../types";
import { runDefinitionAiReview } from "./ai-helpers";
import { reviewsChecker, socialMediaChecker } from "./social-reviews";
import {
  findCartPage,
  findCommerceFlowPage,
  findCommercePage,
  hasAuthenticatedPlatform,
} from "./saas-flow";
import {
  checkLegalPage,
  detectCompanyInfoMatch,
  fail,
  findPage,
  getPageSnapshot,
  manual,
  pageText,
  pass,
} from "./shared";
import { websiteKybChecker, documentKybChecker } from "./website-kyb";
import {
  countMeaningfulExploredPages,
  haystackForPage,
  hasLandingToCommercePath,
  isCreditsBasedBusinessModel,
  pageHasCommerceForm,
  pageHasCurrencyConversion,
  pageHasDeliveryProofSignals,
  pageHasEmailPhoneVerification,
  pageHasHtmlFormWithValidation,
  pageHasOrderConfirmationSignals,
  pageHasPricingOrTotals,
  pageHasPromoCodeField,
} from "./surface-check";

const SECURITY_HEADERS_PASS_SCORE = 60;
const PAGESPEED_PASS_SCORE = 50;

const LEGAL_KEYWORDS: Record<string, string[]> = {
  terms_conditions_page: ["terms", "conditions", "terms-and-conditions"],
  privacy_policy_page: ["privacy"],
  refund_policy_page: ["refund", "returns"],
  delivery_policy_page: ["delivery", "shipping"],
  payment_method_page: ["payment-method", "payment method", "payments", "stripe", "visa", "mastercard", "gpay"],
  cancellation_policy_page: ["cancellation", "cancel"],
};

function legalHandler(key: string): RequirementHandler {
  return (definition, context) =>
    checkLegalPage(definition, context, LEGAL_KEYWORDS[key] || [key]);
}

export const HANDLER_REGISTRY: Record<string, RequirementHandler> = {
  manualRequirementHandler: (definition) =>
    manual(
      definition,
      "This requirement cannot be verified automatically from the website scan alone.",
    ),

  documentKybChecker,

  websiteKybChecker,

  businessPlanAiChecker: (definition, context) => runDefinitionAiReview(definition, context),

  kybVisibilityChecker: (definition, context) => runDefinitionAiReview(definition, context),

  businessPlanChecker: (definition, context) => runDefinitionAiReview(definition, context),

  sslChecker: async (definition, context) => {
    try {
      const response = await fetch(context.websiteUrl, { redirect: "follow" });
      const finalUrl = response.url || context.websiteUrl;
      const secure = finalUrl.startsWith("https://") || context.websiteUrl.startsWith("https://");

      if (!secure) {
        return fail(definition, "Website is not served over HTTPS.");
      }

      const headers = await getScanExternal(context, "security-headers", () =>
        analyzeSecurityHeaders(context.websiteUrl),
      );
      const headerNote = headers.error
        ? ""
        : ` Security headers score: ${headers.score}/100.`;

      return pass(
        definition,
        `HTTPS is active for ${context.hostname} and SSL/TLS connection succeeded.${headerNote}`,
        {
          checkedUrl: finalUrl,
          evidence: {
            url: finalUrl,
            httpStatus: response.status,
            externalData: headers.error ? undefined : { securityHeaders: headers },
          },
        },
      );
    } catch (error) {
      return fail(
        definition,
        `Could not establish HTTPS connection: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  },

  securityHeadersChecker: async (definition, context) => {
    const headers = await getScanExternal(context, "security-headers", () =>
      analyzeSecurityHeaders(context.websiteUrl),
    );
    if (headers.error) {
      return manual(definition, `Security headers check failed: ${headers.error}`);
    }
    if (headers.score >= SECURITY_HEADERS_PASS_SCORE) {
      return pass(
        definition,
        `Security headers score ${headers.score}/100. Present: ${headers.present.join(", ")}.`,
        {
          checkedUrl: context.websiteUrl,
          evidence: {
            url: context.websiteUrl,
            headers: headers.headers,
            calculatedValue: `${headers.score}/100`,
            externalData: { securityHeaders: headers },
          },
        },
      );
    }
    return manual(
      definition,
      `Security headers score ${headers.score}/100. Missing: ${headers.missing.join(", ")}.`,
      {
        checkedUrl: context.websiteUrl,
        evidence: {
          url: context.websiteUrl,
          headers: headers.headers,
          calculatedValue: `${headers.score}/100`,
          externalData: { securityHeaders: headers },
        },
      },
    );
  },

  faviconChecker: async (definition, context) => {
    const homepage = context.pages.find((page) => page.pageType === "homepage")?.url || context.websiteUrl;
    const fetched = await fetch(homepage).then((r) => r.text()).catch(() => "");
    const hasIcon = /rel=["'](?:shortcut )?icon["']/i.test(fetched) || (await fetch(new URL("/favicon.ico", homepage).toString(), { method: "HEAD" }).then((r) => r.ok).catch(() => false));
    return hasIcon
      ? pass(definition, "Favicon reference or /favicon.ico was found.", { checkedUrl: homepage })
      : fail(definition, "No favicon was detected on the homepage.");
  },

  contactPageChecker: (definition, context) => {
    const page = findPage(context, /contact|support|help-desk|helpdesk|help center|customer support/i);
    return page
      ? pass(definition, `Contact/support content discovered on ${page.url}.`, { checkedUrl: page.url })
      : fail(definition, "No Contact Us / Support page or footer support link was discovered.");
  },

  contactFormChecker: async (definition, context) => {
    const page = findPage(context, /contact|support/i);
    if (!page) {
      return manual(
        definition,
        "No dedicated contact page found; site may use support tickets/chat instead of a classic contact form.",
      );
    }
    const snapshot = getPageSnapshot(context, page.url);
    const hay = `${snapshot?.html || ""}\n${snapshot?.visibleText || ""}`;
    const hasForm = /<form[\s\S]*?<\/form>/i.test(hay) && /(email|message|name|phone|subject)/i.test(hay);
    return hasForm
      ? pass(definition, "Contact form elements were detected.", { checkedUrl: page.url })
      : manual(definition, "Support/contact area found but no classic contact form detected.", {
          checkedUrl: page.url,
        });
  },

  companyInfoChecker: async (definition, context) => {
    const combined = pageText(context);
    const homepage = context.pages.find((p) => p.pageType === "homepage")?.url || context.websiteUrl;
    const match = detectCompanyInfoMatch(definition, combined);

    if (match.placeholderIssue) {
      return fail(definition, match.placeholderIssue, { checkedUrl: homepage });
    }
    return match.ok
      ? pass(definition, "Matching company/contact information was found after full-page browser scan.", {
          checkedUrl: homepage,
        })
      : fail(definition, "Required company information was not detected after scrolling all discovered pages.");
  },

  linkChecker: (definition, context) => {
    const broken = context.pages.filter((page) => (page.httpStatus || 0) >= 400);
    return broken.length === 0
      ? pass(definition, `Checked ${context.pages.length} internal pages; no broken pages detected.`)
      : fail(definition, `Broken pages detected: ${broken.slice(0, 5).map((p) => `${p.url} (${p.httpStatus})`).join(", ")}`);
  },

  mobileResponsiveChecker: async (definition, context) => {
    const homepage =
      context.pages.find((p) => p.pageType === "homepage")?.url || context.websiteUrl;

    const pageSpeed = await getScanExternal(context, "pagespeed-mobile", () =>
      fetchPageSpeed(homepage),
    );

    if (!pageSpeed.error && pageSpeed.performanceScore != null) {
      const metrics = {
        performanceScore: pageSpeed.performanceScore,
        lcpMs: pageSpeed.lcpMs,
        cls: pageSpeed.cls,
        mobileFriendly: pageSpeed.mobileFriendly,
      };
      const mobileOk = pageSpeed.mobileFriendly !== false;
      const performanceOk = pageSpeed.performanceScore >= PAGESPEED_PASS_SCORE;

      if (mobileOk && performanceOk) {
        return pass(
          definition,
          `Google PageSpeed mobile score ${pageSpeed.performanceScore}/100; site appears mobile-friendly.`,
          {
            checkedUrl: homepage,
            evidence: {
              url: homepage,
              calculatedValue: `${pageSpeed.performanceScore}/100`,
              externalData: { pageSpeed: metrics },
              metrics,
            },
          },
        );
      }

      return fail(
        definition,
        `PageSpeed mobile score ${pageSpeed.performanceScore}/100${pageSpeed.mobileFriendly === false ? "; mobile usability issues detected" : ""}.`,
        {
          checkedUrl: homepage,
          evidence: {
            url: homepage,
            calculatedValue: `${pageSpeed.performanceScore}/100`,
            externalData: { pageSpeed: metrics },
            metrics,
          },
        },
      );
    }

    const html = await fetch(homepage)
      .then((r) => r.text())
      .catch(() => "");
    const hasViewport = /name=["']viewport["']/i.test(html);
    const fallbackNote = pageSpeed.error
      ? ` PageSpeed unavailable (${pageSpeed.error}); used viewport meta fallback.`
      : " PageSpeed returned no score; used viewport meta fallback.";

    return hasViewport
      ? pass(definition, `Viewport meta tag found; responsive layout likely enabled.${fallbackNote}`, {
          checkedUrl: homepage,
        })
      : fail(definition, `No viewport meta tag found on homepage.${fallbackNote}`, {
          checkedUrl: homepage,
        });
  },

  logoChecker: async (definition, context) => {
    const homepage = context.pages.find((p) => p.pageType === "homepage")?.url || context.websiteUrl;
    const snapshot = getPageSnapshot(context, homepage);
    const hay = `${snapshot?.html || ""}\n${snapshot?.visibleText || ""}`;
    const hasLogo =
      /<img[^>]+(logo|brand)/i.test(hay) ||
      /class=["'][^"']*logo/i.test(hay) ||
      /alt=["'][^"']*(logo|brand)/i.test(hay);
    return hasLogo
      ? pass(definition, "Logo element detected on homepage after browser scroll.", { checkedUrl: homepage })
      : fail(definition, "No website logo detected on homepage.");
  },

  paymentLogoChecker: async (definition, context) => {
    const htmlPages = await Promise.all(
      context.pages.slice(0, 8).map(async (page) => fetch(page.url).then((r) => r.text()).catch(() => "")),
    );
    const combined = htmlPages.join("\n").toLowerCase();
    const hasVisa = combined.includes("visa");
    const hasMastercard = combined.includes("mastercard") || combined.includes("master card");
    return hasVisa && hasMastercard
      ? pass(definition, "Visa and Mastercard references were found.")
      : fail(definition, "Visa/Mastercard logos or references were not found in footer/payment areas.");
  },

  socialMediaChecker,
  reviewsChecker,

  chatbotChecker: (definition, context) => {
    const text = pageText(context);
    const hasBot = /chatbot|live chat|intercom|crisp|tawk|zendesk/i.test(text);
    return hasBot
      ? pass(definition, "Support chat widget/chatbot indicators were detected.")
      : manual(definition, "Support chatbot is optional; none detected automatically.");
  },

  promoCodeChecker: (definition, context) => {
    const commerce = findCommercePage(context);
    if (!commerce) {
      return fail(definition, "No cart/checkout/billing page discovered.");
    }
    if (pageHasPromoCodeField(context, commerce.url)) {
      return pass(definition, `Promo-code field detected on ${commerce.url}.`, { checkedUrl: commerce.url });
    }
    if (isCreditsBasedBusinessModel(context)) {
      return pass(
        definition,
        "Credits/top-up business model detected; dedicated promo-code field is not required.",
        { checkedUrl: commerce.url },
      );
    }
    return pass(
      definition,
      `Commerce page found at ${commerce.url}; no promo-code field detected (optional for this business model).`,
      { checkedUrl: commerce.url },
    );
  },

  cartChecker: (definition, context) => {
    const cart = findCartPage(context);
    const billing = findCommerceFlowPage(context);
    const page = cart || billing;
    if (!page) {
      return fail(definition, "No cart or billing/top-up page was discovered.");
    }
    if (pageHasPricingOrTotals(context, page.url)) {
      return pass(definition, `Pricing/total patterns detected on ${page.url}.`, { checkedUrl: page.url });
    }
    return pass(definition, `Billing/cart page discovered at ${page.url}.`, { checkedUrl: page.url });
  },

  productDescriptionChecker: (definition, context) => {
    const products = context.pages.filter((p) => p.pageType === "product");
    if (products.length === 0) {
      return manual(definition, "No product pages were classified automatically; verify catalogue manually.");
    }
    return pass(definition, `${products.length} product-like pages were discovered for description review.`);
  },

  productPricingChecker: (definition, context) => {
    const text = pageText(context);
    const hasPrice =
      /(?:€|\$|£|usd|eur|gbp)\s?\d+|\d+[.,]\d{2}\s?(?:€|\$|£)?/i.test(text) ||
      /(?:per generated image|per word|top-up|balance)/i.test(text);
    return hasPrice
      ? pass(definition, "Price patterns were detected across scrolled page content.")
      : fail(definition, "No product pricing patterns were detected after full-page browser scan.");
  },

  priceRangeChecker: (definition, context) => {
    const text = pageText(context);
    const prices = [...text.matchAll(/(\d+[.,]\d{2})/g)].map((m) => Number(m[1].replace(",", "."))).filter((n) => n > 0);
    if (prices.length < 2) {
      return manual(definition, "Insufficient price samples detected to validate approved price range.");
    }
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min !== max
      ? pass(definition, `Detected price range ${min.toFixed(2)} - ${max.toFixed(2)} across discovered pages.`)
      : manual(definition, "Only a narrow price range was detected; verify gateway-approved range manually.");
  },

  domainRegistrarChecker,

  domainAgeChecker,

  cloudflareChecker,

  reverseIpChecker,

  domainWhoisChecker,

  domainOwnershipChecker,

  domainOwnershipProofChecker,

  hostingFootprintChecker,

  separateHostingChecker,

  companyEmailRegistrationChecker,

  similarwebChecker: (definition) =>
    manual(definition, "Similarweb API integration is not configured."),

  serankingChecker: (definition) =>
    manual(definition, "SERanking API integration is not configured."),

  webShieldChecker: (definition) =>
    manual(definition, "Web Shield API integration is not configured."),

  g2WebRiskChecker: (definition) =>
    manual(definition, "G2 Web Risk API integration is not configured."),

  geolocationTrafficChecker: (definition) =>
    manual(definition, "Geolocation traffic check requires external provider configuration."),

  aiReviewChecker: (definition, context) => runDefinitionAiReview(definition, context),

  homepageHeroChecker: (definition, context) => runDefinitionAiReview(definition, context),

  contentQualityChecker: (definition, context) => runDefinitionAiReview(definition, context),

  websiteSimilarityChecker: (definition, context) => runDefinitionAiReview(definition, context),

  accountRegistrationChecker: (definition, context) => {
    if (context.loginSucceeded && hasAuthenticatedPlatform(context)) {
      const dashboard = findPage(context, /\/dashboard|\/account|\/settings/i);
      return pass(
        definition,
        `Authenticated platform access confirmed${dashboard ? ` via ${dashboard.url}` : ""}. Login session validates account functionality.`,
        { checkedUrl: dashboard?.url },
      );
    }
    if (context.credentials?.login) {
      return manual(
        definition,
        "Login credentials were provided but authenticated platform exploration did not complete successfully.",
      );
    }
    return manual(definition, "Provide login credentials to evaluate registration/account functionality.");
  },

  passwordRecoveryChecker: (definition, context) => {
    const page = findPage(context, /forgot|reset|recover|password/i);
    return page
      ? pass(definition, `Password recovery page/link discovered at ${page.url}.`, { checkedUrl: page.url })
      : fail(definition, "No password recovery page or link was discovered.");
  },

  twoFactorChecker: (definition, context) => {
    const page = findPage(context, /two[- ]?factor|2fa|mfa|authenticator|verification code|otp/i);
    return page
      ? pass(definition, `Two-factor authentication indicators found at ${page.url}.`, { checkedUrl: page.url })
      : manual(definition, "2FA presence was not detected automatically; verify in account security settings.");
  },

  emailPhoneConfirmationChecker: (definition, context) => {
    if (pageHasEmailPhoneVerification(context)) {
      return pass(definition, "Email or phone verification indicators found on account/signup pages.");
    }
    if (context.loginSucceeded || hasAuthenticatedPlatform(context)) {
      return pass(
        definition,
        "Authenticated account area is available; email/phone confirmation is handled inside the platform.",
      );
    }
    const signup = findPage(context, /signup|register|sign-up/i);
    return signup
      ? pass(definition, `Registration flow page found at ${signup.url}.`, { checkedUrl: signup.url })
      : fail(definition, "No signup or verification flow pages were discovered.");
  },

  orderFormChecker: (definition, context) => {
    const page = findCommercePage(context);
    if (!page) {
      return fail(definition, "No order/checkout/billing page discovered.");
    }
    if (pageHasCommerceForm(context, page.url) || pageHasPricingOrTotals(context, page.url)) {
      return pass(definition, `Order/payment form or pricing UI detected on ${page.url}.`, {
        checkedUrl: page.url,
      });
    }
    return pass(definition, `Commerce flow page discovered at ${page.url}.`, { checkedUrl: page.url });
  },

  currencyConversionChecker: (definition, context) => {
    if (pageHasCurrencyConversion(context)) {
      return pass(definition, "Currency conversion or multi-currency indicators found on the website.");
    }
    const text = pageText(context);
    if (/(€|\$|£|usd|eur|gbp)/i.test(text)) {
      return pass(definition, "Single processing currency detected; dedicated conversion UI not required.");
    }
    return fail(definition, "No currency or conversion indicators were found.");
  },

  acceptedCurrenciesChecker: (definition, context) => {
    const text = pageText(context);
    const currencies = ["USD", "EUR", "GBP"].filter((c) => text.toUpperCase().includes(c));
    return currencies.length > 0
      ? pass(definition, `Currency references detected: ${currencies.join(", ")}.`)
      : manual(definition, "Could not confirm accepted processing currencies automatically.");
  },

  formValidationChecker: (definition, context) => {
    const validationPages = context.pages.filter((page) => {
      const hay = haystackForPage(context, page.url);
      return /<form[\s>]/i.test(hay) && /required|minlength|maxlength|pattern=|type=["']email["']|type=["']tel["']/i.test(hay);
    });
    if (validationPages.length > 0) {
      return pass(
        definition,
        `Forms with validation attributes detected on ${validationPages.length} page(s), e.g. ${validationPages[0]?.url}.`,
        { checkedUrl: validationPages[0]?.url },
      );
    }
    const anyForm = context.pages.some((page) => /<form[\s>]/i.test(haystackForPage(context, page.url)));
    return anyForm
      ? pass(definition, "Interactive forms were discovered during browser exploration.")
      : fail(definition, "No forms with validation indicators were discovered.");
  },

  checkoutFlowChecker: (definition, context) => {
    const commerce = findCommercePage(context);
    if (hasLandingToCommercePath(context) && commerce) {
      return pass(
        definition,
        `Surface end-to-end path verified: landing → commerce flow (${commerce.url}).`,
        { checkedUrl: commerce.url },
      );
    }
    if (commerce) {
      return pass(definition, `Payment/billing flow page found at ${commerce.url}.`, { checkedUrl: commerce.url });
    }
    return fail(definition, "No checkout/payment/billing flow page discovered.");
  },

  orderConfirmationChecker: (definition, context) => {
    if (pageHasOrderConfirmationSignals(context)) {
      const orders = findPage(context, /\/orders\b|order history|receipt|invoice/i);
      return pass(
        definition,
        orders
          ? `Order/payment history area found at ${orders.url}.`
          : "Order or payment confirmation indicators found on explored pages.",
        { checkedUrl: orders?.url },
      );
    }
    return fail(definition, "No order confirmation or order history pages were discovered.");
  },

  controlPurchaseChecker: (definition, context) => {
    const topUp = findPage(context, /top[- ]?up|topup|credits|billing|checkout|payment/i);
    if (!topUp) {
      return fail(definition, "No purchase/top-up/checkout page was discovered for a test purchase.");
    }
    if (pageHasCommerceForm(context, topUp.url) || pageHasPricingOrTotals(context, topUp.url)) {
      return pass(definition, `Real purchase/top-up UI available at ${topUp.url}.`, { checkedUrl: topUp.url });
    }
    return pass(definition, `Purchase flow entry point found at ${topUp.url}.`, { checkedUrl: topUp.url });
  },

  proofOfDeliveryChecker: (definition, context) => {
    if (pageHasDeliveryProofSignals(context)) {
      const docs = findPage(context, /\/documents\b|my documents|\/orders\b/i);
      return pass(
        definition,
        docs
          ? `Digital delivery/proof area found at ${docs.url}.`
          : "Digital product or service delivery indicators found on explored pages.",
        { checkedUrl: docs?.url },
      );
    }
    return fail(definition, "No product/service delivery or documents area was discovered.");
  },

  clickableElementsChecker: (definition, context) => {
    const explored = countMeaningfulExploredPages(context);
    if (explored >= 8) {
      return pass(
        definition,
        `Browser exploration covered ${explored} pages with interactive navigation and clicks.`,
      );
    }
    return fail(definition, `Only ${explored} pages were explored; insufficient clickable coverage.`);
  },

  productReviewsChecker: (definition) =>
    manual(definition, "Product-level review counts require product page inspection."),

  amlPolicyChecker: async (definition, context) => {
    const page = findPage(context, /aml|anti-money|anti money/i);
    if (page) return pass(definition, `AML policy reference found at ${page.url}.`, { checkedUrl: page.url });
    return manual(definition, "AML policy not found on website; verify documents and website publication manually.");
  },

  legalPageChecker: (definition, context) => {
    const name = definition.originalName.toLowerCase();
    if (name.includes("privacy")) return checkLegalPage(definition, context, ["privacy"]);
    if (name.includes("terms")) return checkLegalPage(definition, context, ["terms", "conditions"]);
    if (name.includes("refund")) return checkLegalPage(definition, context, ["refund", "returns"]);
    if (name.includes("delivery")) return checkLegalPage(definition, context, ["delivery", "shipping"]);
    if (name.includes("payment method")) return checkLegalPage(definition, context, ["payment"]);
    if (name.includes("cancellation")) return checkLegalPage(definition, context, ["cancellation", "cancel"]);
    return checkLegalPage(definition, context, [name]);
  },
};

export function getHandler(name: string): RequirementHandler {
  return HANDLER_REGISTRY[name] || HANDLER_REGISTRY.manualRequirementHandler;
}

export async function runRequirementHandler(
  definition: RequirementDefinition,
  context: ScanContext,
) {
  const handler = getHandler(definition.automationHandler);
  try {
    const result = await Promise.resolve(handler(definition, context));
    return { ...result, handlerUsed: definition.automationHandler, startedAt: new Date().toISOString() };
  } catch (error) {
    return manual(
      definition,
      `Check could not be completed automatically: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
