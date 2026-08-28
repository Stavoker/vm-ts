import { hostnameFromUrl } from "@/lib/domain-check";

type RdapEntity = {
  vcardArray?: unknown;
  roles?: string[];
};

type RdapResponse = {
  entities?: RdapEntity[];
  events?: Array<{ eventAction?: string; eventDate?: string }>;
  nameservers?: Array<{ ldhName?: string }>;
};

function registrableDomain(hostname: string): string {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const twoLevel = new Set(["co.uk", "com.au", "co.nz", "com.br", "co.za"]);
  const tail2 = parts.slice(-2).join(".");
  if (twoLevel.has(tail2) && parts.length >= 3) return parts.slice(-3).join(".");
  return tail2;
}

function extractVcardField(vcard: unknown, fieldName: string): string | null {
  if (!Array.isArray(vcard) || !Array.isArray(vcard[1])) return null;
  for (const entry of vcard[1]) {
    if (Array.isArray(entry) && entry[0] === fieldName && typeof entry[3] === "string") {
      return entry[3].trim() || null;
    }
  }
  return null;
}

function entityByRole(entities: RdapEntity[] | undefined, rolePattern: RegExp): RdapEntity | undefined {
  return entities?.find((entity) => (entity.roles || []).some((role) => rolePattern.test(role)));
}

export type DomainInspection = {
  domain: string;
  registrar: string | null;
  registrantOrg: string | null;
  registrantName: string | null;
  createdDate: string | null;
  expiryDate: string | null;
  nameservers: string[];
};

export async function inspectDomain(url: string): Promise<DomainInspection> {
  const hostname = hostnameFromUrl(url);
  const domain = hostname ? registrableDomain(hostname) : "";
  const empty: DomainInspection = {
    domain,
    registrar: null,
    registrantOrg: null,
    registrantName: null,
    createdDate: null,
    expiryDate: null,
    nameservers: [],
  };
  if (!domain) return empty;

  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return empty;
    const data = (await response.json()) as RdapResponse;

    const registrarEntity = entityByRole(data.entities, /registrar/i);
    const registrantEntity = entityByRole(data.entities, /registrant/i);

    const registrarVcard = registrarEntity?.vcardArray;
    const registrantVcard = registrantEntity?.vcardArray;
    const registrar =
      extractVcardField(registrarVcard, "fn") || extractVcardField(registrarVcard, "org");

    const createdDate =
      data.events?.find((event) => /registration/i.test(event.eventAction || ""))?.eventDate?.slice(0, 10) ||
      null;
    const expiryDate =
      data.events?.find((event) => /expir/i.test(event.eventAction || ""))?.eventDate?.slice(0, 10) ||
      null;
    const nameservers = (data.nameservers || [])
      .map((item) => item.ldhName?.toLowerCase())
      .filter(Boolean) as string[];

    return {
      domain,
      registrar,
      registrantOrg: extractVcardField(registrantVcard, "org"),
      registrantName: extractVcardField(registrantVcard, "fn"),
      createdDate,
      expiryDate,
      nameservers,
    };
  } catch {
    return empty;
  }
}

export type HttpFootprint = {
  server: string | null;
  poweredBy: string | null;
  cloudflareProxy: boolean;
  headers: Record<string, string>;
};

export async function inspectHttpFootprint(url: string): Promise<HttpFootprint> {
  const empty: HttpFootprint = {
    server: null,
    poweredBy: null,
    cloudflareProxy: false,
    headers: {},
  };
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "VitrinaRequirementsCheck/1.0" },
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return {
      server: headers.server || null,
      poweredBy: headers["x-powered-by"] || null,
      cloudflareProxy: Boolean(headers["cf-ray"] || /cloudflare/i.test(headers.server || "")),
      headers,
    };
  } catch {
    return empty;
  }
}

export type ReverseIpResult = {
  ip: string | null;
  neighborDomains: string[];
  error?: string;
};

export async function reverseIpLookup(hostname: string): Promise<ReverseIpResult> {
  try {
    const { lookup } = await import("node:dns/promises");
    const ip = await lookup(hostname, { family: 4 });
    const response = await fetch(
      `https://api.hackertarget.com/reverseiplookup/?q=${encodeURIComponent(ip.address)}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    const text = (await response.text()).trim();
    if (!response.ok || /error|API count exceeded|invalid/i.test(text)) {
      return { ip: ip.address, neighborDomains: [], error: text || "Reverse IP lookup unavailable." };
    }
    const neighborDomains = text
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean);
    return { ip: ip.address, neighborDomains };
  } catch (error) {
    return {
      ip: null,
      neighborDomains: [],
      error: error instanceof Error ? error.message : "Reverse IP lookup failed",
    };
  }
}

export function companyNameMatchesRegistrant(siteText: string, inspection: DomainInspection): boolean {
  const candidates = [inspection.registrantOrg, inspection.registrantName].filter(Boolean) as string[];
  if (candidates.length === 0) return false;
  const hay = siteText.toLowerCase();
  return candidates.some((value) => {
    const normalized = value.toLowerCase().trim();
    if (normalized.length < 3) return false;
    if (hay.includes(normalized)) return true;
    const tokens = normalized.split(/\s+/).filter((token) => token.length > 3);
    return tokens.length > 0 && tokens.every((token) => hay.includes(token));
  });
}
