import { hostnameFromUrl } from "@/lib/domain-check";

type RdapResponse = {
  entities?: Array<{ vcardArray?: unknown; roles?: string[] }>;
  events?: Array<{ eventAction?: string; eventDate?: string }>;
  nameservers?: Array<{ ldhName?: string }>;
  remarks?: Array<{ description?: string[] }>;
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

export type DomainInspection = {
  domain: string;
  registrar: string | null;
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
    const registrarEntity = data.entities?.find((entity) =>
      (entity.roles || []).some((role) => /registrar/i.test(role)),
    );
    const vcard = registrarEntity?.vcardArray as unknown;
    const registrar =
      Array.isArray(vcard) &&
      Array.isArray(vcard[1]) &&
      Array.isArray(vcard[1][0]) &&
      typeof vcard[1][0][3] === "string"
        ? (vcard[1][0][3] as string)
        : null;
    const createdDate =
      data.events?.find((event) => /registration/i.test(event.eventAction || ""))?.eventDate?.slice(0, 10) ||
      null;
    const expiryDate =
      data.events?.find((event) => /expir/i.test(event.eventAction || ""))?.eventDate?.slice(0, 10) ||
      null;
    const nameservers = (data.nameservers || [])
      .map((item) => item.ldhName?.toLowerCase())
      .filter(Boolean) as string[];
    return { domain, registrar, createdDate, expiryDate, nameservers };
  } catch {
    return empty;
  }
}
