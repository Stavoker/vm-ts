export const RECOMMENDED_HEADERS = [
  {
    key: "strict-transport-security",
    label: "Strict-Transport-Security",
    weight: 2,
  },
  {
    key: "content-security-policy",
    label: "Content-Security-Policy",
    weight: 2,
  },
  {
    key: "x-content-type-options",
    label: "X-Content-Type-Options",
    weight: 1,
  },
  {
    key: "x-frame-options",
    label: "X-Frame-Options",
    weight: 1,
    altCheck: (headers: Record<string, string>) =>
      Boolean(headers["content-security-policy"]?.includes("frame-ancestors")),
  },
  {
    key: "referrer-policy",
    label: "Referrer-Policy",
    weight: 1,
  },
  {
    key: "permissions-policy",
    label: "Permissions-Policy",
    weight: 1,
    altKeys: ["feature-policy"],
  },
] as const;

export type SecurityHeadersResult = {
  score: number;
  present: string[];
  missing: string[];
  headers: Record<string, string>;
  error?: string;
};

function normalizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

export function evaluateSecurityHeaders(headers: Record<string, string>): Omit<SecurityHeadersResult, "error"> {
  const present: string[] = [];
  const missing: string[] = [];
  let earned = 0;
  let max = 0;

  for (const item of RECOMMENDED_HEADERS) {
    max += item.weight;
    const direct = headers[item.key];
    const alt =
      "altKeys" in item && item.altKeys ? item.altKeys.some((k) => headers[k]) : false;
    const altPass = "altCheck" in item && item.altCheck ? item.altCheck(headers) : false;

    if (direct || alt || altPass) {
      present.push(item.label);
      earned += item.weight;
    } else {
      missing.push(item.label);
    }
  }

  const score = max > 0 ? Math.round((earned / max) * 100) : 0;
  return { score, present, missing, headers };
}

export async function analyzeSecurityHeaders(url: string): Promise<SecurityHeadersResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "VitrinaRequirementsCheck/1.0" },
    });
    const headers = normalizeHeaders(response.headers);
    return evaluateSecurityHeaders(headers);
  } catch (error) {
    return {
      score: 0,
      present: [],
      missing: RECOMMENDED_HEADERS.map((item) => item.label),
      headers: {},
      error: error instanceof Error ? error.message : "Header fetch failed",
    };
  }
}
