import type { CheckResult } from "@/lib/types";

const PARKING_HOSTS = [
  "sedoparking.com",
  "parkingcrew.net",
  "hugedomains.com",
  "afternic.com",
  "dan.com",
  "bodis.com",
  "parklogic.com",
  "dsredirection.com",
  "above.com",
  "cashparking.com",
  "godaddy.com",
  "namecheap.com",
];

const PARKING_NS = [
  "parkingcrew.net",
  "sedoparking.com",
  "bodis.com",
  "parklogic.com",
  "dsredirection.com",
  "above.com",
  "pendingrenewaldeletion",
  "expired.uniregistry",
];

const DOMAIN_EXPIRED_PATTERNS = [
  /this\s+domain\s+(?:name\s+)?(?:has\s+)?expired/i,
  /domain\s+(?:name\s+)?(?:has\s+)?expired/i,
  /renew\s+(?:this\s+)?domain/i,
  /domain\s+is\s+pending\s+renewal/i,
  /redemption\s+period/i,
  /pending\s+delete/i,
  /this\s+domain\s+is\s+parked/i,
  /parked\s+domain/i,
  /домен\s+(?:истёк|истек|просрочен|не\s+оплачен)/i,
  /срок\s+действия\s+домена/i,
  /продлите?\s+домен/i,
  /доменне\s+ім.?я\s+закінч/i,
];

type RdapResponse = {
  status?: string[];
  events?: Array<{ eventAction?: string; eventDate?: string }>;
};

function registrableDomain(hostname: string): string {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const twoLevel = new Set(["co.uk", "com.au", "co.nz", "com.br", "co.za"]);
  const tail2 = parts.slice(-2).join(".");
  if (twoLevel.has(tail2) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return tail2;
}

function isParkingHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return PARKING_HOSTS.some(
    (park) => host === park || host.endsWith(`.${park}`),
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function hostnameFromUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    if (!hostname || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
    if (hostname.includes(":")) return null;
    return hostname.toLowerCase();
  } catch {
    return null;
  }
}

type DnsJson = {
  Status?: number;
  Answer?: Array<{ type: number; data: string }>;
};

async function dnsQuery(
  name: string,
  type: "A" | "AAAA" | "NS",
): Promise<DnsJson | null> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const response = await withTimeout(
    fetch(url, {
      headers: { Accept: "application/dns-json" },
      cache: "no-store",
    }),
    6000,
  );
  if (!response?.ok) return null;
  return (await response.json()) as DnsJson;
}

export async function checkDns(hostname: string): Promise<CheckResult | null> {
  const a = await dnsQuery(hostname, "A");
  const aaaa = a?.Answer?.length ? null : await dnsQuery(hostname, "AAAA");
  const answers = [...(a?.Answer || []), ...(aaaa?.Answer || [])];
  const status = a?.Status ?? aaaa?.Status;

  // 3 = NXDOMAIN
  if (status === 3) {
    return {
      status: "payment_required",
      http_status: null,
      response_time_ms: null,
      status_reason: "Домен не резолвится (NXDOMAIN)",
    };
  }

  const ns = await dnsQuery(registrableDomain(hostname), "NS");
  const nameservers = (ns?.Answer || [])
    .filter((row) => row.type === 2)
    .map((row) => row.data.toLowerCase());
  const parked = nameservers.some((item) =>
    PARKING_NS.some((park) => item.includes(park)),
  );
  if (parked) {
    return {
      status: "payment_required",
      http_status: null,
      response_time_ms: null,
      status_reason: "Домен направлен на parking DNS",
    };
  }

  return null;
}

async function checkRdap(hostname: string): Promise<CheckResult | null> {
  const domain = registrableDomain(hostname);
  const response = await withTimeout(
    fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      cache: "no-store",
    }),
    8000,
  );

  if (!response) return null;

  if (response.status === 404) {
    return {
      status: "payment_required",
      http_status: null,
      response_time_ms: null,
      status_reason: "Домен не найден в реестре (RDAP 404)",
    };
  }

  if (!response.ok) return null;

  const data = (await response.json()) as RdapResponse;
  const statuses = (data.status || []).map((s) => s.toLowerCase());
  if (
    statuses.some((s) =>
      /redemption|pending delete|inactive|hold|expired/.test(s),
    )
  ) {
    return {
      status: "payment_required",
      http_status: null,
      response_time_ms: null,
      status_reason: `Статус домена в реестре: ${statuses.join(", ")}`,
    };
  }

  const expiration = data.events?.find((event) =>
    /expir/i.test(event.eventAction || ""),
  )?.eventDate;

  if (expiration) {
    const expiresAt = new Date(expiration);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return {
        status: "payment_required",
        http_status: null,
        response_time_ms: null,
        status_reason: `Домен истёк ${expiresAt.toISOString().slice(0, 10)}`,
      };
    }
  }

  return null;
}

export function classifyExpiredDomainPage(body: string): CheckResult | null {
  for (const pattern of DOMAIN_EXPIRED_PATTERNS) {
    const match = body.match(pattern);
    if (match?.[0]) {
      return {
        status: "payment_required",
        http_status: null,
        response_time_ms: null,
        status_reason: `Страница домена: «${match[0]}»`,
      };
    }
  }
  return null;
}

export function classifyParkingRedirect(
  requestedUrl: string,
  finalUrl: string,
): CheckResult | null {
  const fromHost = hostnameFromUrl(requestedUrl);
  const toHost = hostnameFromUrl(finalUrl);
  if (!fromHost || !toHost) return null;
  if (registrableDomain(fromHost) === registrableDomain(toHost)) return null;
  if (!isParkingHost(toHost)) return null;
  return {
    status: "payment_required",
    http_status: null,
    response_time_ms: null,
    status_reason: `Домен редиректит на parking (${toHost})`,
  };
}

export async function checkDomainHealth(
  url: string,
): Promise<CheckResult | null> {
  const hostname = hostnameFromUrl(url);
  if (!hostname) return null;

  const dnsResult = await checkDns(hostname);
  if (dnsResult) return dnsResult;

  try {
    return await checkRdap(hostname);
  } catch {
    return null;
  }
}
