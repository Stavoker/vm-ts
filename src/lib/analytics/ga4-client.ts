import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { AnalyticsError, mapGoogleError } from "./errors";
import { HISTORICAL_TTL_MS, REALTIME_TTL_MS, cacheGet, cacheKey, cacheSet } from "./cache";
import { inHourRange } from "./date-range";
import { parseMetric, parseRate } from "./format";
import type { AnalyticsFilters, ResolvedDateRange } from "./types";

type Ga4Row = {
  dimensionValues?: Array<{ value?: string | null } | null> | null;
  metricValues?: Array<{ value?: string | null } | null> | null;
};

type DimensionFilter = {
  filter?: {
    fieldName?: string;
    stringFilter?: {
      matchType?: "EXACT";
      value?: string;
      caseSensitive?: boolean;
    };
  };
  andGroup?: { expressions?: DimensionFilter[] };
};

export const OVERVIEW_METRICS = [
  "activeUsers",
  "totalUsers",
  "newUsers",
  "sessions",
  "engagedSessions",
  "screenPageViews",
  "bounceRate",
  "engagementRate",
  "screenPageViewsPerSession",
  "averageSessionDuration",
] as const;

export const BREAKDOWN_METRICS = [
  "activeUsers",
  "totalUsers",
  "sessions",
  "engagedSessions",
  "screenPageViews",
] as const;

export const TIMESERIES_METRICS = [
  "activeUsers",
  "newUsers",
  "sessions",
  "engagedSessions",
  "screenPageViews",
] as const;

export type Ga4ReportResult = {
  dimensionHeaders: string[];
  metricHeaders: string[];
  rows: string[][];
};

let client: BetaAnalyticsDataClient | null = null;

export function assertGoogleCredentials(): void {
  const hasFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const hasPair = Boolean(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
  if (!hasFile && !hasPair) {
    throw new AnalyticsError(
      "missing_credentials",
      "Google Analytics credentials are missing. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.",
      500,
    );
  }
}

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/^["']|["']$/g, "");
}

export function getAnalyticsClient(): BetaAnalyticsDataClient {
  if (client) return client;
  assertGoogleCredentials();

  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const projectId = process.env.GOOGLE_PROJECT_ID;

  if (email && privateKey) {
    client = new BetaAnalyticsDataClient({
      fallback: true,
      projectId: projectId || undefined,
      credentials: {
        client_email: email,
        private_key: normalizePrivateKey(privateKey),
      },
    });
  } else {
    client = new BetaAnalyticsDataClient({
      fallback: true,
      projectId: projectId || undefined,
    });
  }
  return client;
}

export function normalizePropertyId(raw: string): string {
  const match = raw.trim().match(/^(?:properties\/)?(\d+)$/);
  if (!match) {
    throw new AnalyticsError("invalid_property", "Invalid GA4 Property ID", 400);
  }
  return match[1];
}

export function propertyName(propertyId: string): string {
  return `properties/${normalizePropertyId(propertyId)}`;
}

export function buildDimensionFilter(filters: AnalyticsFilters): DimensionFilter | undefined {
  const expressions: DimensionFilter[] = [];
  const add = (fieldName: string, value?: string) => {
    if (!value?.trim()) return;
    expressions.push({
      filter: {
        fieldName,
        stringFilter: {
          matchType: "EXACT",
          value: value.trim(),
          caseSensitive: false,
        },
      },
    });
  };
  add("country", filters.country);
  add("deviceCategory", filters.device);
  add("sessionSource", filters.source);
  add("sessionMedium", filters.medium);
  add("sessionCampaignName", filters.campaign);
  add("landingPage", filters.page);
  if (expressions.length === 0) return undefined;
  if (expressions.length === 1) return expressions[0];
  return { andGroup: { expressions } };
}

export async function runGa4Report(input: {
  propertyId: string;
  dateRange: ResolvedDateRange;
  metrics: string[];
  dimensions?: string[];
  filters?: AnalyticsFilters;
  limit?: number;
  orderByMetric?: string;
  fresh?: boolean;
}): Promise<Ga4ReportResult> {
  const key = cacheKey([
    "report",
    input.propertyId,
    input.dateRange.startDate,
    input.dateRange.endDate,
    input.dateRange.startDateHour,
    input.dateRange.endDateHour,
    input.metrics,
    input.dimensions,
    input.filters,
    input.limit,
    input.orderByMetric,
  ]);
  if (!input.fresh) {
    const cached = cacheGet<Ga4ReportResult>(key);
    if (cached) return cached;
  }

  try {
    const ga = getAnalyticsClient();
    const [response] = await ga.runReport({
      property: propertyName(input.propertyId),
      dateRanges: [{ startDate: input.dateRange.startDate, endDate: input.dateRange.endDate }],
      metrics: input.metrics.map((name) => ({ name })),
      dimensions: input.dimensions?.map((name) => ({ name })),
      dimensionFilter: buildDimensionFilter(input.filters ?? {}),
      limit: input.limit ?? 100,
      orderBys: input.orderByMetric
        ? [{ metric: { metricName: input.orderByMetric }, desc: true }]
        : undefined,
    });

    const dimensionHeaders = (response.dimensionHeaders ?? []).map((header) => header.name || "");
    const metricHeaders = (response.metricHeaders ?? []).map((header) => header.name || "");
    let rows = (response.rows ?? []).map((row) =>
      serializeRow(row, dimensionHeaders.length, metricHeaders.length),
    );

    if (input.dateRange.startDateHour && dimensionHeaders[0] === "dateHour") {
      rows = rows.filter((row) => inHourRange(row[0], input.dateRange.startDateHour, input.dateRange.endDateHour));
    }

    const result = { dimensionHeaders, metricHeaders, rows };
    cacheSet(key, result, HISTORICAL_TTL_MS);
    return result;
  } catch (error) {
    throw mapGoogleError(error);
  }
}

export async function runGa4Realtime(input: {
  propertyId: string;
  metrics: string[];
  dimensions?: string[];
  limit?: number;
  fresh?: boolean;
}): Promise<Ga4ReportResult> {
  const key = cacheKey(["realtime", input.propertyId, input.metrics, input.dimensions, input.limit]);
  if (!input.fresh) {
    const cached = cacheGet<Ga4ReportResult>(key);
    if (cached) return cached;
  }
  try {
    const ga = getAnalyticsClient();
    const [response] = await ga.runRealtimeReport({
      property: propertyName(input.propertyId),
      metrics: input.metrics.map((name) => ({ name })),
      dimensions: input.dimensions?.map((name) => ({ name })),
      limit: input.limit ?? 50,
    });

    const dimensionHeaders = (response.dimensionHeaders ?? []).map((header) => header.name || "");
    const metricHeaders = (response.metricHeaders ?? []).map((header) => header.name || "");
    const rows = (response.rows ?? []).map((row) =>
      serializeRow(row, dimensionHeaders.length, metricHeaders.length),
    );
    const result = { dimensionHeaders, metricHeaders, rows };
    cacheSet(key, result, REALTIME_TTL_MS);
    return result;
  } catch (error) {
    throw mapGoogleError(error);
  }
}

function serializeRow(row: Ga4Row, dimCount: number, metricCount: number): string[] {
  const dims = (row.dimensionValues ?? []).map((value) => value?.value || "");
  const metrics = (row.metricValues ?? []).map((value) => value?.value || "0");
  while (dims.length < dimCount) dims.push("");
  while (metrics.length < metricCount) metrics.push("0");
  return [...dims, ...metrics];
}

export function rowMetrics(
  row: string[],
  dimensionCount: number,
  metricHeaders: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < metricHeaders.length; i += 1) {
    const header = metricHeaders[i];
    const raw = row[dimensionCount + i];
    out[header] = /rate/i.test(header) ? parseRate(raw) : parseMetric(raw);
  }
  return out;
}
