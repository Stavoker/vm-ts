import { detectPlaceholders, hasPlaceholderRegistrationNumber } from "../content/placeholders";
import type { RequirementCheckResult, RequirementDefinition, ScanContext } from "../types";
import { fail, manual, pass, pageText, getPageSnapshot } from "./shared";

const LEGAL_PAGE_PATTERN = /legal|terms|privacy|about|contact|company|impressum|imprint|footer/i;

export function buildKybLegalExcerpt(context: ScanContext, maxLength = 16_000): string {
  const sections: string[] = [];

  for (const page of context.pages) {
    const haystack = `${page.url} ${page.title || ""}`;
    if (!LEGAL_PAGE_PATTERN.test(haystack)) continue;
    const snapshot = getPageSnapshot(context, page.url);
    const body = snapshot?.visibleText?.trim();
    if (body) sections.push(`${page.url}\n${body}`);
  }

  const combined = sections.length > 0 ? sections.join("\n\n") : pageText(context);
  return combined.slice(0, maxLength);
}

const REG_NUMBER_PATTERNS = [
  /\b(?:company\s+)?(?:reg(?:istration)?\.?\s*(?:no|number|#)?|crn|company\s+no\.?)\s*[:\.]?\s*[A-Z0-9][A-Z0-9\-/]{4,}\b/i,
  /\breg\.?\s*(?:no|number|#)?\s*[:\.]?\s*\d{5,}\b/i,
];

const ADDRESS_PATTERN =
  /(street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|drive|dr\.|boulevard|blvd|address|postal|zip|\b\d{4,6}\b|[\p{L}]{3,}\s+\d{1,4}[-/]\d{1,4})/iu;

const OPERATING_ADDRESS_HINT = /\b(operating|trading|business)\s+address\b/i;

const DOCUMENT_ONLY_KYB =
  /\b(passport|director id|ubo|shareholder confirmation|articles of association|board resolution|cv\b|proof of address|utility bill|bank statement|id document)\b/i;

function websiteMatchForKyb(definition: RequirementDefinition, text: string): boolean {
  const name = definition.originalName.toLowerCase();

  if (/registration number|company reg|reg\.?\s*no/i.test(name)) {
    return (
      REG_NUMBER_PATTERNS.some((pattern) => pattern.test(text)) ||
      (/\breg(?:istration)?\b/i.test(text) && /\b\d{5,}\b/.test(text))
    );
  }
  if (/registered address|operating address|company address/i.test(name)) {
    return ADDRESS_PATTERN.test(text);
  }
  if (/company name|legal name|registered company/i.test(name)) {
    return /(ltd|limited|llc|gmbh|company|corp|inc|ou|as)\b/i.test(text);
  }
  if (/tax country|jurisdiction|country of incorporation/i.test(name)) {
    return /\b(country|jurisdiction|registered in|incorporated in|vat|tax)\b/i.test(text);
  }
  if (/industry|nature of business|business activity/i.test(name)) {
    return /\b(services|products|platform|saas|software|business|industry|we provide|we offer)\b/i.test(text);
  }
  if (/certificate|registry extract|incorporation/i.test(name)) {
    return REG_NUMBER_PATTERNS.some((pattern) => pattern.test(text)) || /\bincorporat(ed|ion)\b/i.test(text);
  }

  return false;
}

export function documentKybChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): RequirementCheckResult {
  if (
    definition.id === "company_registration_number" ||
    definition.id === "company_registered_address" ||
    definition.id === "company_operating_address_if_different"
  ) {
    return websiteKybChecker(definition, context);
  }

  const text = pageText(context);

  if (hasPlaceholderRegistrationNumber(text)) {
    return fail(definition, "Registration number appears to be a placeholder (e.g. 00000000).");
  }

  const placeholders = detectPlaceholders(text);
  if (websiteMatchForKyb(definition, text) && placeholders.length === 0) {
    return pass(definition, "Matching company/KYB information was found on website pages.");
  }

  if (websiteMatchForKyb(definition, text) && placeholders.length > 0) {
    return fail(definition, `Possible placeholder content detected: ${placeholders.join(", ")}.`);
  }

  if (DOCUMENT_ONLY_KYB.test(definition.originalName)) {
    return manual(
      definition,
      "This KYB item is typically not published on the public website; no supporting upload is required for the scan.",
    );
  }

  return fail(definition, "Required company/KYB information was not found on website pages.");
}

export function websiteKybChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): RequirementCheckResult {
  const text = pageText(context);

  switch (definition.id) {
    case "company_registration_number": {
      if (hasPlaceholderRegistrationNumber(text)) {
        return fail(definition, "Registration number appears to be a placeholder (e.g. 00000000).");
      }
      const hasRegNumber =
        REG_NUMBER_PATTERNS.some((pattern) => pattern.test(text)) ||
        (/\breg(?:istration)?\b/i.test(text) && /\b\d{5,}\b/.test(text));
      return hasRegNumber
        ? pass(definition, "Company registration number found on website pages.")
        : fail(definition, "No company registration number detected on website pages.");
    }
    case "company_registered_address": {
      return ADDRESS_PATTERN.test(text)
        ? pass(definition, "Registered address found on website pages.")
        : fail(definition, "No registered address detected on website pages.");
    }
    case "company_operating_address_if_different": {
      if (OPERATING_ADDRESS_HINT.test(text)) {
        return pass(definition, "Operating/trading address mentioned on website.");
      }
      if (ADDRESS_PATTERN.test(text)) {
        return pass(definition, "Company address found on website; operating address appears the same or not separately listed.");
      }
      return fail(definition, "No company address detected on website pages.");
    }
    default:
      return documentKybChecker(definition, context);
  }
}
