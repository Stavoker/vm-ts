import { NextResponse } from "next/server";
import { AnalyticsError } from "./errors";
import { resolveDateRange } from "./date-range";
import type { AnalyticsQuery, BounceDimension, ChartGranularity, DatePreset } from "./types";

const PRESETS = new Set<DatePreset>([
  "today",
  "last_24h",
  "last_36h",
  "yesterday",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_90d",
  "this_month",
  "previous_month",
  "custom",
]);

const GRANULARITIES = new Set<ChartGranularity>(["auto", "hourly", "daily", "weekly"]);
const BOUNCE_DIMENSIONS = new Set<BounceDimension>([
  "country",
  "device",
  "source",
  "landingPage",
  "campaign",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAllSites(siteId: string): boolean {
  return siteId === "all";
}

export function assertSiteId(siteId: string): void {
  if (siteId !== "all" && !UUID_RE.test(siteId)) {
    throw new AnalyticsError("invalid_query", "Invalid site ID", 400);
  }
}

export function parseAnalyticsQuery(request: Request): AnalyticsQuery {
  const url = new URL(request.url);
  const presetRaw = url.searchParams.get("preset") || "last_7d";
  if (!PRESETS.has(presetRaw as DatePreset)) {
    throw new AnalyticsError("invalid_query", "Invalid date range preset", 400);
  }
  const granularityRaw = (url.searchParams.get("granularity") || "auto") as ChartGranularity;
  if (!GRANULARITIES.has(granularityRaw)) {
    throw new AnalyticsError("invalid_query", "Invalid granularity", 400);
  }
  const bounceRaw = url.searchParams.get("bounceDimension");
  if (bounceRaw && !BOUNCE_DIMENSIONS.has(bounceRaw as BounceDimension)) {
    throw new AnalyticsError("invalid_query", "Invalid bounce breakdown dimension", 400);
  }
  const optional = (name: string) => url.searchParams.get(name)?.trim() || undefined;
  return {
    preset: presetRaw as DatePreset,
    from: optional("from"),
    to: optional("to"),
    country: optional("country"),
    device: optional("device"),
    source: optional("source"),
    medium: optional("medium"),
    campaign: optional("campaign"),
    page: optional("page"),
    granularity: granularityRaw,
    bounceDimension: bounceRaw as BounceDimension | undefined,
    fresh: url.searchParams.get("fresh") === "1",
  };
}

export function queryToRange(query: AnalyticsQuery) {
  try {
    return resolveDateRange({
      preset: query.preset,
      from: query.from,
      to: query.to,
      granularity: query.granularity,
    });
  } catch (error) {
    throw new AnalyticsError(
      "invalid_query",
      error instanceof Error ? error.message : "Invalid date range",
      400,
    );
  }
}

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof AnalyticsError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Failed";
  return NextResponse.json({ error: message, code: "unknown" }, { status: 500 });
}

export function filtersOf(query: AnalyticsQuery) {
  return {
    country: query.country,
    device: query.device,
    source: query.source,
    medium: query.medium,
    campaign: query.campaign,
    page: query.page,
  };
}
