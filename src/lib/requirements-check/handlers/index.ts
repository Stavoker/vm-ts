import { inspectDomain } from "../domain-inspect";
import type {
  RequirementDefinition,
  RequirementHandler,
  ScanContext,
} from "../types";
import {
  checkLegalPage,
  fail,
  findPage,
  manual,
  pageText,
  pass,
} from "./shared";

const LEGAL_KEYWORDS: Record<string, string[]> = {
  terms_conditions_page: ["terms", "conditions", "terms-and-conditions"],
  privacy_policy_page: ["privacy"],
  refund_policy_page: ["refund", "returns"],
  delivery_policy_page: ["delivery", "shipping"],
  payment_method_page: ["payment-method", "payment method", "payments"],
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

  documentKybChecker: (definition) =>
    manual(
      definition,
      "Company/KYB document verification requires supporting documentation not available during a website scan.",
    ),

  businessPlanChecker: (definition) =>
    manual(
      definition,
      "Business plan verification requires uploaded business-plan documentation.",
    ),

  sslChecker: async (definition, context) => {
    try {
      const response = await fetch(context.websiteUrl, { redirect: "manual" });
      const secure = context.websiteUrl.startsWith("https://") || response.status === 301 || response.status === 302;
      if (!secure) {
        return fail(definition, "Website is not served over HTTPS.");
      }
      return pass(definition, "HTTPS is enabled for the website.", {
        checkedUrl: context.websiteUrl,
        evidence: { url: context.websiteUrl, httpStatus: response.status },
      });
    } catch (error) {
      return manual(definition, `Could not verify SSL automatically: ${error instanceof Error ? error.message : "unknown error"}`);
    }
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
    const page = findPage(context, /contact|support|help-desk|helpdesk/i);
    return page
      ? pass(definition, `Contact/support page discovered at ${page.url}.`, { checkedUrl: page.url })
      : fail(definition, "No Contact Us / Support page was discovered.");
  },

  contactFormChecker: async (definition, context) => {
    const page = findPage(context, /contact/i);
    if (!page) return fail(definition, "No contact page found to inspect for a form.");
    const html = await fetch(page.url).then((r) => r.text()).catch(() => "");
    const hasForm = /<form[\s\S]*?<\/form>/i.test(html) && /(email|message|name|phone)/i.test(html);
    return hasForm
      ? pass(definition, "Contact form elements were detected on the contact page.", { checkedUrl: page.url })
      : fail(definition, "Contact page exists but no contact form was detected.");
  },

  companyInfoChecker: async (definition, context) => {
    const text = pageText(context);
    const homepage = context.pages.find((p) => p.pageType === "homepage")?.url || context.websiteUrl;
    const html = await fetch(homepage).then((r) => r.text()).catch(() => "");
    const combined = `${text}\n${html.toLowerCase()}`;
    const name = /registered company name displayed/i.test(definition.originalName);
    const address = /company address displayed/i.test(definition.originalName);
    const email = /company email displayed/i.test(definition.originalName);
    const phone = /contact number displayed/i.test(definition.originalName);
    const ok =
      (name && /(ltd|limited|llc|gmbh|company|corp|inc)/i.test(combined)) ||
      (address && /(street|road|avenue|address|postal|zip)/i.test(combined)) ||
      (email && /@[a-z0-9.-]+\.[a-z]{2,}/i.test(combined)) ||
      (phone && /(\+?\d[\d\s().-]{7,}\d)/.test(combined));
    return ok
      ? pass(definition, "Matching company/contact information pattern was found on the website.", { checkedUrl: homepage })
      : fail(definition, "Required company information was not detected on discovered pages.");
  },

  linkChecker: (definition, context) => {
    const broken = context.pages.filter((page) => (page.httpStatus || 0) >= 400);
    return broken.length === 0
      ? pass(definition, `Checked ${context.pages.length} internal pages; no broken pages detected.`)
      : fail(definition, `Broken pages detected: ${broken.slice(0, 5).map((p) => `${p.url} (${p.httpStatus})`).join(", ")}`);
  },

  mobileResponsiveChecker: async (definition, context) => {
    const homepage = context.pages.find((p) => p.pageType === "homepage")?.url || context.websiteUrl;
    const html = await fetch(homepage).then((r) => r.text()).catch(() => "");
    const hasViewport = /name=["']viewport["']/i.test(html);
    return hasViewport
      ? pass(definition, "Viewport meta tag found; responsive layout likely enabled.", { checkedUrl: homepage })
      : fail(definition, "No viewport meta tag found on homepage.");
  },

  logoChecker: async (definition, context) => {
    const homepage = context.pages.find((p) => p.pageType === "homepage")?.url || context.websiteUrl;
    const html = await fetch(homepage).then((r) => r.text()).catch(() => "");
    const hasLogo = /<img[^>]+(logo|brand)/i.test(html) || /class=["'][^"']*logo/i.test(html);
    return hasLogo
      ? pass(definition, "Logo element detected on homepage.", { checkedUrl: homepage })
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

  socialMediaChecker: (definition, context) => {
    const text = pageText(context);
    const hasSocial = /(facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok)/i.test(text);
    return hasSocial
      ? pass(definition, "Social media links were discovered on the website.")
      : manual(definition, "No social media links were discovered automatically; verify manually if optional.");
  },

  reviewsChecker: (definition, context) => {
    const text = pageText(context);
    const hasReviews = /review|testimonial|rating|stars/i.test(text);
    return hasReviews
      ? pass(definition, "Reviews/testimonials content was detected.")
      : manual(definition, "Reviews are optional; none were detected automatically.");
  },

  chatbotChecker: (definition, context) => {
    const text = pageText(context);
    const hasBot = /chatbot|live chat|intercom|crisp|tawk|zendesk/i.test(text);
    return hasBot
      ? pass(definition, "Support chat widget/chatbot indicators were detected.")
      : manual(definition, "Support chatbot is optional; none detected automatically.");
  },

  promoCodeChecker: (definition, context) => {
    const cart = findPage(context, /cart|checkout/i);
    return cart
      ? manual(definition, "Promo-code availability depends on business model; inspect cart/checkout manually.")
      : manual(definition, "No cart/checkout page discovered to verify promo-code field.");
  },

  cartChecker: (definition, context) => {
    const cart = findPage(context, /cart|basket|bag/i);
    return cart
      ? manual(definition, `Cart page discovered at ${cart.url}. Automated add-to-cart validation requires interactive browser testing.`, { checkedUrl: cart.url })
      : fail(definition, "No cart page was discovered.");
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
    const hasPrice = /(?:\$|€|£|usd|eur|gbp)\s?\d+|\d+[.,]\d{2}/i.test(text);
    return hasPrice
      ? pass(definition, "Price patterns were detected on discovered pages.")
      : fail(definition, "No product pricing patterns were detected.");
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

  domainRegistrarChecker: async (definition, context) => {
    const domain = await inspectDomain(`https://${context.hostname}`);
    const registrar = domain.registrar || "unknown";
    const isCom = context.hostname.endsWith(".com");
    const known = /godaddy|bigrock/i.test(registrar);
    if (isCom && known) {
      return pass(definition, `Domain uses .com and registrar appears to be ${registrar}.`);
    }
    return manual(definition, `Registrar detected as ${registrar}. Verify .com registration via GoDaddy/BigRock manually.`);
  },

  domainAgeChecker: async (definition, context) => {
    const domain = await inspectDomain(`https://${context.hostname}`);
    if (!domain.createdDate) {
      return manual(definition, "Domain creation date unavailable from RDAP.");
    }
    return pass(definition, `Domain creation date: ${domain.createdDate}.`, {
      evidence: { calculatedValue: domain.createdDate, externalData: domain as unknown as Record<string, unknown> },
    });
  },

  cloudflareChecker: async (definition, context) => {
    const domain = await inspectDomain(`https://${context.hostname}`);
    const cf = domain.nameservers.some((ns) => /cloudflare/i.test(ns));
    return cf
      ? pass(definition, "Cloudflare nameservers detected.", { evidence: { externalData: { nameservers: domain.nameservers } } })
      : manual(definition, "Cloudflare not detected automatically; activation/screenshot requires manual verification.");
  },

  reverseIpChecker: (definition) =>
    manual(
      definition,
      "Reverse IP lookup requires external provider configuration.",
    ),

  domainWhoisChecker: async (definition, context) => {
    const domain = await inspectDomain(`https://${context.hostname}`);
    return domain.registrar
      ? pass(definition, `WHOIS/RDAP data retrieved. Registrar: ${domain.registrar}.`)
      : manual(definition, "WHOIS/RDAP lookup did not return registrar details.");
  },

  domainOwnershipChecker: (definition) =>
    manual(definition, "Domain ownership linkage to company/director requires document review."),

  hostingFootprintChecker: (definition) =>
    manual(definition, "Hosting footprint review requires external infrastructure analysis."),

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

  aiReviewChecker: (definition) =>
    manual(definition, "Qualitative AI review requires configured AI provider and representative screenshots."),

  homepageHeroChecker: (definition) =>
    manual(definition, "Homepage hero image check requires visual review or configured AI review."),

  contentQualityChecker: (definition) =>
    manual(definition, "Content uniqueness/grammar review requires AI or human editorial review."),

  websiteSimilarityChecker: (definition) =>
    manual(definition, "Template similarity review requires comparison set and AI/visual analysis."),

  accountRegistrationChecker: (definition, context) =>
    context.credentials?.login
      ? manual(definition, "Authenticated account checks require an active browser login session.")
      : manual(definition, "Provide login credentials to evaluate registration/account functionality."),

  passwordRecoveryChecker: (definition, context) => {
    const page = findPage(context, /forgot|reset|recover|password/i);
    return page
      ? pass(definition, `Password recovery page/link discovered at ${page.url}.`, { checkedUrl: page.url })
      : fail(definition, "No password recovery page or link was discovered.");
  },

  twoFactorChecker: (definition) =>
    manual(definition, "2FA presence requires authenticated login inspection."),

  emailPhoneConfirmationChecker: (definition) =>
    manual(definition, "Email/phone confirmation requires authenticated registration flow testing."),

  orderFormChecker: (definition, context) => {
    const checkout = findPage(context, /checkout|order/i);
    return checkout
      ? manual(definition, `Order/checkout page discovered at ${checkout.url}; end-to-end validation requires interactive testing.`, { checkedUrl: checkout.url })
      : fail(definition, "No order/checkout page discovered.");
  },

  currencyConversionChecker: (definition) =>
    manual(definition, "Currency conversion requires interactive checkout testing."),

  acceptedCurrenciesChecker: (definition, context) => {
    const text = pageText(context);
    const currencies = ["USD", "EUR", "GBP"].filter((c) => text.toUpperCase().includes(c));
    return currencies.length > 0
      ? pass(definition, `Currency references detected: ${currencies.join(", ")}.`)
      : manual(definition, "Could not confirm accepted processing currencies automatically.");
  },

  formValidationChecker: (definition) =>
    manual(definition, "Form validation requires interactive browser form testing."),

  checkoutFlowChecker: (definition, context) => {
    const checkout = findPage(context, /checkout|payment/i);
    return checkout
      ? manual(definition, `Checkout page discovered at ${checkout.url}. Full payment flow requires manual or sandbox testing.`, { checkedUrl: checkout.url })
      : fail(definition, "No checkout/payment flow page discovered.");
  },

  orderConfirmationChecker: (definition) =>
    manual(definition, "Order confirmation generation requires completing a test order in sandbox."),

  clickableElementsChecker: (definition) =>
    manual(definition, "Full clickable-element testing requires interactive browser traversal."),

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
