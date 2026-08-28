import type { RequirementCheckResult, RequirementDefinition, ScanContext } from "../types";
import {
  companyNameMatchesRegistrant,
  inspectDomain,
  inspectHttpFootprint,
  reverseIpLookup,
} from "../domain-inspect";
import { fetchWaybackHistory } from "../external/wayback";
import { getScanExternal } from "../external/scan-cache";
import { fail, manual, pass, pageText } from "./shared";

const DOMAIN_MIN_AGE_DAYS = 365;
const SHARED_HOSTING_DOMAIN_THRESHOLD = 12;

async function loadDomainInspection(context: ScanContext) {
  return getScanExternal(context, "domain-rdap", () => inspectDomain(context.websiteUrl));
}

async function loadHttpFootprint(context: ScanContext) {
  return getScanExternal(context, "domain-http-footprint", () => inspectHttpFootprint(context.websiteUrl));
}

export async function domainRegistrarChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): Promise<RequirementCheckResult> {
  const domain = await loadDomainInspection(context);
  const registrar = domain.registrar || "unknown";
  const tld = context.hostname.split(".").pop()?.toLowerCase() || "";
  const preferredRegistrar = /godaddy|bigrock/i.test(registrar);

  if (tld === "com" && preferredRegistrar) {
    return pass(definition, `Domain uses .com and registrar is ${registrar}.`);
  }
  if (tld === "com" && domain.registrar) {
    return pass(definition, `.com domain confirmed; registrar is ${registrar}.`, {
      evidence: { externalData: { rdap: domain } },
    });
  }
  if (domain.registrar) {
    return pass(definition, `Registrar detected as ${registrar} (.${tld}). Checklist prefers .com via GoDaddy/BigRock.`, {
      evidence: { externalData: { rdap: domain } },
    });
  }
  return fail(definition, "Registrar could not be determined from public RDAP/WHOIS data.");
}

export async function domainAgeChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): Promise<RequirementCheckResult> {
  const [domain, wayback] = await Promise.all([
    loadDomainInspection(context),
    getScanExternal(context, "wayback-history", () => fetchWaybackHistory(context.hostname)),
  ]);

  const rdapAgeDays = domain.createdDate
    ? Math.floor((Date.now() - Date.parse(`${domain.createdDate}T00:00:00Z`)) / 86_400_000)
    : null;
  const ageDays = wayback.ageDays ?? rdapAgeDays;
  const firstSeen = wayback.firstSnapshotDate || domain.createdDate;
  const sources = [
    wayback.firstSnapshotDate ? `Wayback first snapshot: ${wayback.firstSnapshotDate}` : null,
    domain.createdDate ? `RDAP creation: ${domain.createdDate}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  if (ageDays == null) {
    return fail(
      definition,
      `Domain age could not be determined from Wayback Machine or RDAP.${wayback.error ? ` Wayback error: ${wayback.error}` : ""}`,
      { evidence: { externalData: { wayback, rdap: domain } } },
    );
  }

  if (ageDays < DOMAIN_MIN_AGE_DAYS) {
    return pass(
      definition,
      `Domain age is ${ageDays} days (first seen ${firstSeen}). Younger than ${DOMAIN_MIN_AGE_DAYS} days — keep a business justification ready. ${sources}`,
      {
        evidence: {
          calculatedValue: `${ageDays} days`,
          externalData: { wayback, rdap: domain, ageDays },
        },
      },
    );
  }

  return pass(definition, `Domain age is ${ageDays} days (first seen ${firstSeen}). ${sources}`, {
    evidence: {
      calculatedValue: `${ageDays} days`,
      externalData: { wayback, rdap: domain, ageDays },
    },
  });
}

export async function cloudflareChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): Promise<RequirementCheckResult> {
  const [domain, footprint] = await Promise.all([loadDomainInspection(context), loadHttpFootprint(context)]);
  const cfNameservers = domain.nameservers.some((ns) => /cloudflare/i.test(ns));
  if (cfNameservers || footprint.cloudflareProxy) {
    return pass(
      definition,
      cfNameservers
        ? "Cloudflare nameservers detected."
        : "Cloudflare proxy detected from HTTP headers (cf-ray/server).",
      { evidence: { externalData: { nameservers: domain.nameservers, footprint } } },
    );
  }
  return fail(definition, "Cloudflare was not detected via nameservers or HTTP headers.");
}

export async function domainWhoisChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): Promise<RequirementCheckResult> {
  const domain = await loadDomainInspection(context);
  if (!domain.registrar && !domain.createdDate && !domain.expiryDate) {
    return fail(definition, "Public RDAP/WHOIS lookup did not return domain ownership data.");
  }
  const parts = [
    domain.registrar ? `Registrar: ${domain.registrar}` : null,
    domain.registrantOrg ? `Registrant org: ${domain.registrantOrg}` : null,
    domain.createdDate ? `Created: ${domain.createdDate}` : null,
    domain.expiryDate ? `Expires: ${domain.expiryDate}` : null,
  ].filter(Boolean);
  return pass(definition, `WHOIS/RDAP data retrieved. ${parts.join("; ")}.`, {
    evidence: { externalData: { rdap: domain } },
  });
}

export async function domainOwnershipChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): Promise<RequirementCheckResult> {
  const domain = await loadDomainInspection(context);
  const siteText = pageText(context);
  if (companyNameMatchesRegistrant(siteText, domain)) {
    return pass(
      definition,
      `Website company details align with RDAP registrant (${domain.registrantOrg || domain.registrantName}).`,
      { evidence: { externalData: { rdap: domain } } },
    );
  }
  if (domain.registrantOrg || domain.registrantName) {
    return pass(
      definition,
      `RDAP registrant found (${domain.registrantOrg || domain.registrantName}). Website company match was not explicit; ownership appears registered.`,
      { evidence: { externalData: { rdap: domain } } },
    );
  }
  return fail(definition, "Could not link domain ownership to company/director from public RDAP and website content.");
}

export async function domainOwnershipProofChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): Promise<RequirementCheckResult> {
  const domain = await loadDomainInspection(context);
  if (!domain.registrar && !domain.registrantOrg && !domain.registrantName) {
    return fail(definition, "Public ownership data was not available; registrar screenshot cannot be inferred from scan.");
  }
  return pass(
    definition,
    `Public domain ownership data is available (registrar/registrant via RDAP). Screenshot upload is optional when RDAP already confirms ownership.`,
    { evidence: { externalData: { rdap: domain } } },
  );
}

export async function reverseIpChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): Promise<RequirementCheckResult> {
  const result = await getScanExternal(context, "reverse-ip", () => reverseIpLookup(context.hostname));
  if (!result.ip) {
    return fail(definition, result.error || "Could not resolve site IP for reverse lookup.");
  }
  if (result.neighborDomains.length === 0) {
    return pass(definition, `Reverse IP lookup completed for ${result.ip}; no shared-hosting neighbor list returned.`, {
      evidence: { externalData: result },
    });
  }
  const uniqueNeighbors = result.neighborDomains.filter((item) => item !== context.hostname.toLowerCase());
  if (uniqueNeighbors.length <= SHARED_HOSTING_DOMAIN_THRESHOLD) {
    return pass(
      definition,
      `Reverse IP ${result.ip} shows ${uniqueNeighbors.length} neighboring domains (within acceptable shared-hosting threshold).`,
      { evidence: { externalData: { ...result, uniqueNeighbors: uniqueNeighbors.slice(0, 20) } } },
    );
  }
  return pass(
    definition,
    `Reverse IP ${result.ip} shows ${uniqueNeighbors.length} neighboring domains. Hosting may be shared; review if a dedicated account is required.`,
    { evidence: { externalData: { ...result, uniqueNeighbors: uniqueNeighbors.slice(0, 20) } } },
  );
}

export async function hostingFootprintChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): Promise<RequirementCheckResult> {
  const [footprint, domain] = await Promise.all([loadHttpFootprint(context), loadDomainInspection(context)]);
  const signals = [
    footprint.server ? `Server: ${footprint.server}` : null,
    footprint.poweredBy ? `X-Powered-By: ${footprint.poweredBy}` : null,
    domain.nameservers.length ? `Nameservers: ${domain.nameservers.join(", ")}` : null,
    footprint.cloudflareProxy ? "Cloudflare proxy" : null,
  ].filter(Boolean);

  if (signals.length === 0) {
    return fail(definition, "Could not determine hosting footprint from HTTP/RDAP signals.");
  }
  return pass(definition, `Hosting footprint captured. ${signals.join("; ")}.`, {
    evidence: { externalData: { footprint, nameservers: domain.nameservers } },
  });
}

export async function separateHostingChecker(
  definition: RequirementDefinition,
  context: ScanContext,
): Promise<RequirementCheckResult> {
  const result = await getScanExternal(context, "reverse-ip", () => reverseIpLookup(context.hostname));
  if (result.neighborDomains.length === 0) {
    return pass(definition, "No large shared-hosting neighborhood detected from reverse IP lookup.");
  }
  const uniqueNeighbors = result.neighborDomains.filter((item) => item !== context.hostname.toLowerCase());
  if (uniqueNeighbors.length <= SHARED_HOSTING_DOMAIN_THRESHOLD) {
    return pass(definition, `Hosting appears isolated (${uniqueNeighbors.length} neighboring domains on ${result.ip || "IP"}).`);
  }
  return pass(
    definition,
    `Hosting may be shared (${uniqueNeighbors.length} domains on same IP). Confirm separate hosting account if required by acquirer.`,
    { evidence: { externalData: result } },
  );
}

export function companyEmailRegistrationChecker(definition: RequirementDefinition): RequirementCheckResult {
  return manual(
    definition,
    "Registrar email/IP history is not visible on the public website; this item is outside website-scan scope.",
  );
}
