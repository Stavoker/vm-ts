import { aggregateOverviews, emptyOverview, mergeBreakdownRows, mergeTimeseriesWithEngagement, metricsFromRow, withShares } from "./aggregate";
import { isoWeekKey } from "./date-range";
import { AnalyticsError } from "./errors";
import {
  BREAKDOWN_METRICS,
  OVERVIEW_METRICS,
  TIMESERIES_METRICS,
  rowMetrics,
  runGa4Realtime,
  runGa4Report,
} from "./ga4-client";
import { resolveAnalyticsSites } from "./sites";
import { formatDateLabel, formatHourLabel } from "./timezone";
import type {
  AnalyticsFilters,
  AnalyticsQuery,
  AnalyticsSite,
  BounceDimension,
  BreakdownRow,
  OverviewMetrics,
  RealtimeSnapshot,
  ResolvedDateRange,
  SiteBreakdownRow,
  TimeseriesPoint,
} from "./types";

type QueryContext = {
  query: AnalyticsQuery;
  range: ResolvedDateRange;
};

async function forEachSite<T>(
  siteId: string,
  mapper: (site: AnalyticsSite) => Promise<T>,
): Promise<{ site: AnalyticsSite; value?: T; error?: string }[]> {
  const sites = await resolveAnalyticsSites(siteId);
  const settled = await Promise.allSettled(sites.map((site) => mapper(site)));
  return settled.map((result, index) => {
    if (result.status === "fulfilled") return { site: sites[index], value: result.value };
    const message = result.reason instanceof Error ? result.reason.message : "Failed";
    return { site: sites[index], error: message };
  });
}

function requireSome<T>(results: { site: AnalyticsSite; value?: T; error?: string }[]): T[] {
  const values = results.map((result) => result.value).filter((value): value is T => value != null);
  if (values.length === 0) {
    const first = results[0]?.error;
    throw new AnalyticsError("unknown", first || "Google Analytics request failed", 502);
  }
  return values;
}

export async function getOverview(siteId: string, ctx: QueryContext) {
  const results = await forEachSite(siteId, (site) => getSiteOverview(site, ctx));
  const overviews = requireSome(results);
  const sites: SiteBreakdownRow[] = results.map((result) => ({
    siteId: result.site.id,
    siteName: result.site.name,
    domain: result.site.domain,
    activeUsers: result.value?.activeUsers ?? 0,
    sessions: result.value?.sessions ?? 0,
    pageViews: result.value?.pageViews ?? 0,
    bounceRate: result.value?.bounceRate ?? 0,
    engagementRate: result.value?.engagementRate ?? 0,
    error: result.error,
  }));
  return {
    range: ctx.range,
    metrics: aggregateOverviews(overviews),
    sites,
    partialErrors: results.filter((result) => result.error).map((result) => ({
      siteId: result.site.id,
      siteName: result.site.name,
      error: result.error,
    })),
  };
}

async function getSiteOverview(site: AnalyticsSite, ctx: QueryContext): Promise<OverviewMetrics> {
  const report = await runGa4Report({
    propertyId: site.ga4_property_id,
    dateRange: ctx.range,
    metrics: [...OVERVIEW_METRICS],
    filters: filters(ctx.query),
    fresh: ctx.query.fresh,
    limit: 1,
  });
  if (report.rows.length === 0) return emptyOverview();
  return metricsFromRow(rowMetrics(report.rows[0], report.dimensionHeaders.length, report.metricHeaders));
}

export async function getRealtime(siteId: string, ctx: QueryContext): Promise<RealtimeSnapshot> {
  const results = await forEachSite(siteId, (site) => getSiteRealtime(site, ctx.query.fresh));
  const snapshots = requireSome(results);
  const byCountry = mergeNamedCounts(snapshots.flatMap((item) => item.byCountry));
  const byDevice = mergeNamedCounts(snapshots.flatMap((item) => item.byDevice));
  return {
    activeUsers: snapshots.reduce((sum, item) => sum + item.activeUsers, 0),
    pageViews: snapshots.reduce((sum, item) => sum + item.pageViews, 0),
    windowLabel: "Users active in the last 30 minutes",
    byCountry,
    byDevice,
  };
}

async function getSiteRealtime(site: AnalyticsSite, fresh?: boolean): Promise<RealtimeSnapshot> {
  const [totals, countries, devices] = await Promise.all([
    runGa4Realtime({
      propertyId: site.ga4_property_id,
      metrics: ["activeUsers", "screenPageViews"],
      fresh,
      limit: 1,
    }),
    runGa4Realtime({
      propertyId: site.ga4_property_id,
      metrics: ["activeUsers"],
      dimensions: ["country"],
      fresh,
      limit: 20,
    }),
    runGa4Realtime({
      propertyId: site.ga4_property_id,
      metrics: ["activeUsers"],
      dimensions: ["deviceCategory"],
      fresh,
      limit: 10,
    }),
  ]);
  const totalsValues = totals.rows[0]
    ? rowMetrics(totals.rows[0], totals.dimensionHeaders.length, totals.metricHeaders)
    : { activeUsers: 0, screenPageViews: 0 };
  return {
    activeUsers: totalsValues.activeUsers ?? 0,
    pageViews: totalsValues.screenPageViews ?? 0,
    windowLabel: "Users active in the last 30 minutes",
    byCountry: countries.rows.map((row) => ({
      label: row[0] || "(not set)",
      activeUsers: rowMetrics(row, 1, countries.metricHeaders).activeUsers ?? 0,
    })),
    byDevice: devices.rows.map((row) => ({
      label: row[0] || "(not set)",
      activeUsers: rowMetrics(row, 1, devices.metricHeaders).activeUsers ?? 0,
    })),
  };
}

export async function getTimeseries(siteId: string, ctx: QueryContext) {
  const results = await forEachSite(siteId, (site) => getSiteTimeseries(site, ctx));
  const series = requireSome(results);
  return {
    range: ctx.range,
    granularity: ctx.range.granularity,
    points: mergeTimeseriesWithEngagement(series),
    partialErrors: results.filter((result) => result.error).map((result) => ({
      siteId: result.site.id,
      error: result.error,
    })),
  };
}

async function getSiteTimeseries(site: AnalyticsSite, ctx: QueryContext): Promise<TimeseriesPoint[]> {
  const dimension = ctx.range.granularity === "hourly" ? "dateHour" : "date";
  const report = await runGa4Report({
    propertyId: site.ga4_property_id,
    dateRange: ctx.range,
    metrics: [...TIMESERIES_METRICS],
    dimensions: [dimension],
    filters: filters(ctx.query),
    fresh: ctx.query.fresh,
    limit: 5000,
  });
  const points: TimeseriesPoint[] = report.rows.map((row) => {
    const values = rowMetrics(row, 1, report.metricHeaders);
    const engagementRate = values.sessions ? (values.engagedSessions ?? 0) / values.sessions : 0;
    const key = row[0];
    const dateLabel = dimension === "dateHour" ? formatHourLabel(key) : formatDateLabel(normalizeGa4Date(key));
    return {
      key: dimension === "dateHour" ? key : normalizeGa4Date(key),
      label: dateLabel,
      activeUsers: values.activeUsers ?? 0,
      newUsers: values.newUsers ?? 0,
      sessions: values.sessions ?? 0,
      pageViews: values.screenPageViews ?? 0,
      bounceRate: values.sessions ? 1 - engagementRate : 0,
      engagementRate,
    };
  });

  if (ctx.range.granularity !== "weekly") {
    return points.sort((a, b) => a.key.localeCompare(b.key));
  }

  const grouped = new Map<string, TimeseriesPoint & { engagedSessions: number }>();
  for (const point of points) {
    const week = isoWeekKey(normalizeGa4Date(point.key));
    const current = grouped.get(week);
    const engagedSessions = Math.round(point.sessions * point.engagementRate);
    if (!current) {
      grouped.set(week, {
        ...point,
        key: week,
        label: `Week of ${formatDateLabel(week)}`,
        engagedSessions,
      });
      continue;
    }
    current.activeUsers += point.activeUsers;
    current.newUsers += point.newUsers;
    current.sessions += point.sessions;
    current.pageViews += point.pageViews;
    current.engagedSessions += engagedSessions;
  }
  return [...grouped.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((point) => ({
      key: point.key,
      label: point.label,
      activeUsers: point.activeUsers,
      newUsers: point.newUsers,
      sessions: point.sessions,
      pageViews: point.pageViews,
      bounceRate: point.sessions ? 1 - point.engagedSessions / point.sessions : 0,
      engagementRate: point.sessions ? point.engagedSessions / point.sessions : 0,
    }));
}

export async function getDimensionBreakdown(
  siteId: string,
  ctx: QueryContext,
  dimensions: string[],
  labelOf: (keys: Record<string, string>) => string,
): Promise<{ range: ResolvedDateRange; rows: BreakdownRow[]; partialErrors: { siteId: string; error?: string }[] }> {
  const results = await forEachSite(siteId, (site) =>
    getSiteBreakdown(site, ctx, dimensions, labelOf),
  );
  const rows = mergeBreakdownRows(requireSome(results).flat());
  return {
    range: ctx.range,
    rows,
    partialErrors: results.filter((result) => result.error).map((result) => ({
      siteId: result.site.id,
      error: result.error,
    })),
  };
}

async function getSiteBreakdown(
  site: AnalyticsSite,
  ctx: QueryContext,
  dimensions: string[],
  labelOf: (keys: Record<string, string>) => string,
): Promise<BreakdownRow[]> {
  const report = await runGa4Report({
    propertyId: site.ga4_property_id,
    dateRange: ctx.range,
    metrics: [...BREAKDOWN_METRICS],
    dimensions,
    filters: filters(ctx.query),
    fresh: ctx.query.fresh,
    orderByMetric: "sessions",
    limit: 100,
  });
  const rows: BreakdownRow[] = report.rows.map((row) => {
    const keys: Record<string, string> = {};
    for (let i = 0; i < dimensions.length; i += 1) {
      keys[dimensions[i]] = row[i] || "(not set)";
    }
    const values = rowMetrics(row, dimensions.length, report.metricHeaders);
    const sessions = values.sessions ?? 0;
    const engagedSessions = values.engagedSessions ?? 0;
    const rates = {
      engagementRate: sessions ? engagedSessions / sessions : 0,
    };
    return {
      keys,
      label: labelOf(keys),
      activeUsers: values.activeUsers ?? 0,
      totalUsers: values.totalUsers ?? 0,
      sessions,
      pageViews: values.screenPageViews ?? 0,
      engagedSessions,
      bounceRate: sessions ? 1 - rates.engagementRate : 0,
      engagementRate: rates.engagementRate,
      sessionsShare: 0,
      usersShare: 0,
    };
  });
  return withShares(rows);
}

export function getCountries(siteId: string, ctx: QueryContext) {
  return getDimensionBreakdown(siteId, ctx, ["country"], (keys) => keys.country);
}

export function getDevices(siteId: string, ctx: QueryContext) {
  return getDimensionBreakdown(siteId, ctx, ["deviceCategory"], (keys) => keys.deviceCategory);
}

export function getSources(siteId: string, ctx: QueryContext) {
  return getDimensionBreakdown(siteId, ctx, ["sessionSource", "sessionMedium"], (keys) => {
    return `${keys.sessionSource} / ${keys.sessionMedium}`;
  });
}

export function getCampaigns(siteId: string, ctx: QueryContext) {
  return getDimensionBreakdown(
    siteId,
    ctx,
    ["sessionCampaignName", "sessionSource", "sessionMedium"],
    (keys) => keys.sessionCampaignName,
  );
}

export function getLandingPages(siteId: string, ctx: QueryContext) {
  return getDimensionBreakdown(siteId, ctx, ["landingPage"], (keys) => keys.landingPage);
}

const BOUNCE_DIMENSIONS: Record<BounceDimension, string[]> = {
  country: ["country"],
  device: ["deviceCategory"],
  source: ["sessionSource", "sessionMedium"],
  landingPage: ["landingPage"],
  campaign: ["sessionCampaignName"],
};

export function getBounceBreakdown(siteId: string, ctx: QueryContext) {
  const dimension = ctx.query.bounceDimension || "country";
  const names = BOUNCE_DIMENSIONS[dimension];
  return getDimensionBreakdown(siteId, ctx, names, (keys) => Object.values(keys).join(" / "));
}

export async function testGa4Connection(siteId: string) {
  const [site] = await resolveAnalyticsSites(siteId);
  const report = await runGa4Report({
    propertyId: site.ga4_property_id,
    dateRange: {
      preset: "last_7d",
      startDate: "7daysAgo",
      endDate: "today",
      usesHourly: false,
      granularity: "daily",
      label: "Last 7 days",
      timezone: "UTC",
    },
    metrics: ["totalUsers", "sessions"],
    fresh: true,
    limit: 1,
  });
  const values = report.rows[0]
    ? rowMetrics(report.rows[0], report.dimensionHeaders.length, report.metricHeaders)
    : { totalUsers: 0, sessions: 0 };
  return {
    ok: true,
    siteName: site.name,
    propertyId: site.ga4_property_id,
    measurementId: site.ga4_measurement_id,
    totalUsers: values.totalUsers ?? 0,
    sessions: values.sessions ?? 0,
    message: `GA4 connected successfully. Property: ${site.name}. Property ID: ${site.ga4_property_id}`,
  };
}

function filters(query: AnalyticsQuery): AnalyticsFilters {
  return {
    country: query.country,
    device: query.device,
    source: query.source,
    medium: query.medium,
    campaign: query.campaign,
    page: query.page,
  };
}

function mergeNamedCounts(rows: { label: string; activeUsers: number }[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.label, (map.get(row.label) ?? 0) + row.activeUsers);
  }
  return [...map.entries()]
    .map(([label, activeUsers]) => ({ label, activeUsers }))
    .sort((a, b) => b.activeUsers - a.activeUsers);
}

/** GA4 date dimension is YYYYMMDD; dateHour is YYYYMMDDHH. */
export function normalizeGa4Date(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}
