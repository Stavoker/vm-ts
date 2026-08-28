import { isIP } from "node:net";
import { getHostname } from "./url-utils";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function validatePublicWebsiteUrl(raw: string): { ok: true; url: string; hostname: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "Only http:// and https:// URLs are allowed" };
  }

  const hostname = getHostname(parsed.toString());
  if (!hostname || BLOCKED_HOSTS.has(hostname)) {
    return { ok: false, error: "Blocked hostname" };
  }

  const ipVersion = isIP(hostname);
  if (ipVersion && isPrivateIp(hostname)) {
    return { ok: false, error: "Private or local addresses are not allowed" };
  }

  return { ok: true, url: parsed.toString(), hostname };
}

export async function assertResolvedTargetsArePublic(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Resolved target is private");
    return;
  }

  const dns = await import("node:dns/promises");
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error(`DNS resolved to private address: ${record.address}`);
    }
  }
}
