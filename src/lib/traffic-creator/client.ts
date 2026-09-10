import { readJsonResponse } from "@/lib/fetch-json";
import { parseBalance, parseCampaign, parseCampaignList, type TrafficBalance, type TrafficCampaign } from "./parse";

const DEFAULT_BASE = "https://traffic-creator.com/api/v1/account";
const ACCOUNT_KEY_PREFIX = "tgp_account_";

export class TrafficCreatorError extends Error {
  status: number;
  retryAfter: number | null;

  constructor(message: string, status = 500, retryAfter: number | null = null) {
    super(message);
    this.name = "TrafficCreatorError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function sanitizeTrafficCreatorKey(raw: string | undefined | null): string {
  return (raw || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

export function trafficCreatorApiKey(): string {
  const key = sanitizeTrafficCreatorKey(process.env.TRAFFIC_CREATOR_API_KEY);
  if (!key) {
    throw new TrafficCreatorError(
      "Missing TRAFFIC_CREATOR_API_KEY. Create a named key in Traffic Creator → Settings → Developer API.",
      500,
    );
  }
  return key;
}

function keyFingerprint(key: string): string {
  const prefix = key.startsWith(ACCOUNT_KEY_PREFIX) ? ACCOUNT_KEY_PREFIX : "other";
  return `len=${key.length} prefix=${prefix}`;
}

function baseUrl(): string {
  return (process.env.TRAFFIC_CREATOR_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
}

function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : null;
}

async function tcFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = trafficCreatorApiKey();
  const url = `${baseUrl()}${path}`;
  const headers = new Headers(init.headers);
  headers.set("X-API-KEY", key);
  headers.set("Accept", "application/json");
  headers.set("User-Agent", "VitrinaMonitor/1.0 (Traffic Creator Account API)");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const method = (init.method || "GET").toUpperCase();
  const response = await fetch(url, {
    ...init,
    method,
    headers,
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw await mapError(response, method, url, key);
  }
  if (response.status === 204) return {} as T;
  return readJsonResponse<T>(response);
}

function snippet(raw: string, max = 400): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}

async function mapError(
  response: Response,
  method: string,
  requestUrl: string,
  key: string,
): Promise<TrafficCreatorError> {
  const retryAfter = retryAfterSeconds(response);
  const raw = (await response.text()).trim();
  const contentType = response.headers.get("content-type") || "";
  const cfRay = response.headers.get("cf-ray") || "";
  const server = response.headers.get("server") || "";
  let detail = "";
  try {
    const body = JSON.parse(raw) as { error?: string; message?: string; detail?: string };
    detail = body.error || body.message || body.detail || "";
  } catch {
    detail = snippet(raw);
  }

  console.warn("[traffic-creator] upstream error", {
    method,
    url: requestUrl,
    status: response.status,
    contentType,
    server: server || undefined,
    cfRay: cfRay || undefined,
    apiKeyHeader: "X-API-KEY",
    keyMeta: keyFingerprint(key),
    body: snippet(raw, 500),
  });

  const fallback: Record<number, string> = {
    401: "Traffic Creator API key is missing, invalid or revoked.",
    403: "Traffic Creator returned 403. The account API key was sent in X-API-KEY.",
    404: "Campaign not found in this Traffic Creator account.",
    409: "Campaign settings version or campaign state conflict. Refresh and retry.",
    422: "Invalid Traffic Creator settings.",
    429: "Traffic Creator rate limit reached. Try again shortly.",
    503: "Traffic Creator is temporarily unavailable.",
  };
  const parts = [
    fallback[response.status] || `Traffic Creator API error (HTTP ${response.status})`,
    detail && detail !== fallback[response.status] ? `Upstream: ${detail}` : "",
    `${method} ${requestUrl} → HTTP ${response.status}`,
  ].filter(Boolean);

  if (response.status === 403) {
    const serverIp = await lookupOutboundIp();
    if (serverIp) parts.push(`Render outbound IP ${serverIp}.`);
    if (cfRay) parts.push(`cf-ray ${cfRay}.`);
  }

  return new TrafficCreatorError(parts.join(" "), response.status, retryAfter);
}

async function lookupOutboundIp(): Promise<string | null> {
  try {
    const response = await fetch("https://api.ipify.org", { cache: "no-store" });
    if (!response.ok) return null;
    const ip = (await response.text()).trim();
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) ? ip : null;
  } catch {
    return null;
  }
}

export async function getTrafficBalance(): Promise<TrafficBalance> {
  const payload = await tcFetch<unknown>("/balance");
  return parseBalance(payload);
}

export async function listTrafficCampaigns(): Promise<TrafficCampaign[]> {
  const campaigns: TrafficCampaign[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const payload = await tcFetch<unknown>(`/campaigns?${query.toString()}`);
    const parsed = parseCampaignList(payload);
    campaigns.push(...parsed.campaigns);
    if (!parsed.nextCursor || parsed.campaigns.length === 0) break;
    after = parsed.nextCursor;
  }
  return campaigns;
}

export async function getTrafficCampaign(id: string): Promise<TrafficCampaign> {
  const payload = await tcFetch<unknown>(`/campaigns/${encodeURIComponent(id)}`);
  const campaign = parseCampaign(payload);
  if (!campaign) throw new TrafficCreatorError("Campaign response did not include an id", 502);
  return campaign;
}

export async function pauseTrafficCampaign(id: string): Promise<TrafficCampaign> {
  await tcFetch(`/campaigns/${encodeURIComponent(id)}/pause`, { method: "POST" });
  return getTrafficCampaign(id);
}

export async function resumeTrafficCampaign(id: string): Promise<TrafficCampaign> {
  await tcFetch(`/campaigns/${encodeURIComponent(id)}/resume`, { method: "POST" });
  return getTrafficCampaign(id);
}

export async function updateTrafficCampaignDailyLimit(id: string, dailyLimit: number): Promise<TrafficCampaign> {
  const current = await getTrafficCampaign(id);
  try {
    return await patchDailyLimit(id, dailyLimit, current.settings_version);
  } catch (error) {
    if (error instanceof TrafficCreatorError && error.status === 409) {
      const latest = await getTrafficCampaign(id);
      return patchDailyLimit(id, dailyLimit, latest.settings_version);
    }
    throw error;
  }
}

async function patchDailyLimit(
  id: string,
  dailyLimit: number,
  settingsVersion: number | null,
): Promise<TrafficCampaign> {
  const body: Record<string, unknown> = { daily_limit: dailyLimit };
  if (settingsVersion != null) body.settings_version = settingsVersion;
  const payload = await tcFetch<unknown>(`/campaigns/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return parseCampaign(payload) ?? getTrafficCampaign(id);
}

export function jsonTrafficError(error: unknown) {
  if (error instanceof TrafficCreatorError) {
    return {
      status: error.status,
      body: { error: error.message, retryAfter: error.retryAfter },
    };
  }
  const message = error instanceof Error ? error.message : "Failed";
  return { status: 500, body: { error: message } };
}

export function assertCampaignId(id: string): string {
  const value = id.trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    throw new TrafficCreatorError("Invalid campaign id", 400);
  }
  return value;
}

export function assertDailyLimit(value: unknown): number {
  const limit = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TrafficCreatorError("daily_limit must be a positive integer (visits per day)", 400);
  }
  return limit;
}
