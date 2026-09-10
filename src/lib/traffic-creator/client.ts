import { readJsonResponse } from "@/lib/fetch-json";
import { parseBalance, parseCampaign, parseCampaignList, type TrafficBalance, type TrafficCampaign } from "./parse";

const DEFAULT_BASE = "https://traffic-creator.com/api/v1/account";

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

export function trafficCreatorApiKey(): string {
  const key = process.env.TRAFFIC_CREATOR_API_KEY?.trim();
  if (!key) {
    throw new TrafficCreatorError(
      "Missing TRAFFIC_CREATOR_API_KEY. Create a named key in Traffic Creator → Settings → Developer API.",
      500,
    );
  }
  return key;
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
  const headers = new Headers(init.headers);
  headers.set("X-API-KEY", key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await mapError(response);
  }
  if (response.status === 204) return {} as T;
  return readJsonResponse<T>(response);
}

async function mapError(response: Response): Promise<TrafficCreatorError> {
  const retryAfter = retryAfterSeconds(response);
  let detail = "";
  try {
    const body = await readJsonResponse<{ error?: string; message?: string; detail?: string }>(response);
    detail = body.error || body.message || body.detail || "";
  } catch {
    detail = "";
  }

  const fallback: Record<number, string> = {
    401: "Traffic Creator API key is missing, invalid or revoked.",
    403: "Traffic Creator access denied. Check account permissions or approved server IP.",
    404: "Campaign not found in this Traffic Creator account.",
    409: "Campaign settings version or state conflict. Refresh and retry.",
    422: "Invalid Traffic Creator settings.",
    429: "Traffic Creator rate limit reached. Try again shortly.",
    503: "Traffic Creator is temporarily unavailable.",
  };
  let message = detail || fallback[response.status] || `Traffic Creator API error (HTTP ${response.status})`;
  if (response.status === 403) {
    const outboundIp = await outboundIp();
    if (outboundIp) {
      message = `${message} This server's outbound IP is ${outboundIp}. Add it in Traffic Creator → Settings → Developer API.`;
    }
  }
  return new TrafficCreatorError(message, response.status, retryAfter);
}

async function outboundIp(): Promise<string | null> {
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
