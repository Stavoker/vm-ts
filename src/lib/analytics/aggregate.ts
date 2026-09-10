import { computeRates, viewsPerSession, weightedAverage } from "./format";
import type { BreakdownRow, OverviewMetrics, SiteBreakdownRow, TimeseriesPoint } from "./types";

export function emptyOverview(): OverviewMetrics {
  return {
    activeUsers: 0,
    totalUsers: 0,
    newUsers: 0,
    sessions: 0,
    engagedSessions: 0,
    pageViews: 0,
    bounceRate: 0,
    engagementRate: 0,
    viewsPerSession: 0,
    averageSessionDuration: 0,
  };
}

export function metricsFromRow(
  values: Record<string, number>,
  fallback?: Partial<OverviewMetrics>,
): OverviewMetrics {
  const sessions = values.sessions ?? fallback?.sessions ?? 0;
  const engagedSessions = values.engagedSessions ?? fallback?.engagedSessions ?? 0;
  const pageViews = values.screenPageViews ?? fallback?.pageViews ?? 0;
  const rates = computeRates(sessions, engagedSessions);
  return {
    activeUsers: values.activeUsers ?? 0,
    totalUsers: values.totalUsers ?? 0,
    newUsers: values.newUsers ?? 0,
    sessions,
    engagedSessions,
    pageViews,
    bounceRate: values.bounceRate ?? rates.bounceRate,
    engagementRate: values.engagementRate ?? rates.engagementRate,
    viewsPerSession: values.screenPageViewsPerSession ?? viewsPerSession(pageViews, sessions),
    averageSessionDuration: values.averageSessionDuration ?? 0,
  };
}

export function aggregateOverviews(items: OverviewMetrics[]): OverviewMetrics {
  const sessions = items.reduce((sum, item) => sum + item.sessions, 0);
  const engagedSessions = items.reduce((sum, item) => sum + item.engagedSessions, 0);
  const pageViews = items.reduce((sum, item) => sum + item.pageViews, 0);
  const rates = computeRates(sessions, engagedSessions);
  return {
    activeUsers: items.reduce((sum, item) => sum + item.activeUsers, 0),
    totalUsers: items.reduce((sum, item) => sum + item.totalUsers, 0),
    newUsers: items.reduce((sum, item) => sum + item.newUsers, 0),
    sessions,
    engagedSessions,
    pageViews,
    bounceRate: rates.bounceRate,
    engagementRate: rates.engagementRate,
    viewsPerSession: viewsPerSession(pageViews, sessions),
    averageSessionDuration: weightedAverage(
      items.map((item) => ({ weight: item.sessions, value: item.averageSessionDuration })),
    ),
  };
}

export function mergeBreakdownRows(rows: BreakdownRow[]): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const row of rows) {
    const key = JSON.stringify(row.keys);
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...row });
      continue;
    }
    current.activeUsers += row.activeUsers;
    current.totalUsers += row.totalUsers;
    current.sessions += row.sessions;
    current.pageViews += row.pageViews;
    current.engagedSessions += row.engagedSessions;
  }
  const merged = [...map.values()];
  const totalSessions = merged.reduce((sum, row) => sum + row.sessions, 0);
  const totalUsers = merged.reduce((sum, row) => sum + row.totalUsers, 0);
  for (const row of merged) {
    const rates = computeRates(row.sessions, row.engagedSessions);
    row.bounceRate = rates.bounceRate;
    row.engagementRate = rates.engagementRate;
    row.sessionsShare = totalSessions > 0 ? row.sessions / totalSessions : 0;
    row.usersShare = totalUsers > 0 ? row.totalUsers / totalUsers : 0;
  }
  return merged.sort((a, b) => b.sessions - a.sessions);
}

export function withShares(rows: BreakdownRow[]): BreakdownRow[] {
  const totalSessions = rows.reduce((sum, row) => sum + row.sessions, 0);
  const totalUsers = rows.reduce((sum, row) => sum + row.totalUsers, 0);
  return rows.map((row) => ({
    ...row,
    sessionsShare: totalSessions > 0 ? row.sessions / totalSessions : 0,
    usersShare: totalUsers > 0 ? row.totalUsers / totalUsers : 0,
  }));
}

export function mergeTimeseries(seriesList: TimeseriesPoint[][]): TimeseriesPoint[] {
  const map = new Map<string, TimeseriesPoint>();
  for (const series of seriesList) {
    for (const point of series) {
      const current = map.get(point.key);
      if (!current) {
        map.set(point.key, { ...point });
        continue;
      }
      current.activeUsers += point.activeUsers;
      current.newUsers += point.newUsers;
      current.sessions += point.sessions;
      current.pageViews += point.pageViews;
      current.bounceRate = 0;
      current.engagementRate = 0;
    }
  }
  const merged = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  return merged.map((point) => {
    const engagedEstimate = Math.round(point.sessions * (1 - point.bounceRate));
    const rates = computeRates(point.sessions, engagedEstimate);
    return {
      ...point,
      bounceRate: rates.bounceRate,
      engagementRate: rates.engagementRate,
    };
  });
}

export function mergeTimeseriesWithEngagement(seriesList: TimeseriesPoint[][]): TimeseriesPoint[] {
  type Acc = TimeseriesPoint & { engagedSessions: number };
  const map = new Map<string, Acc>();
  for (const series of seriesList) {
    for (const point of series) {
      const engagedSessions = Math.round(point.sessions * point.engagementRate);
      const current = map.get(point.key);
      if (!current) {
        map.set(point.key, { ...point, engagedSessions });
        continue;
      }
      current.activeUsers += point.activeUsers;
      current.newUsers += point.newUsers;
      current.sessions += point.sessions;
      current.pageViews += point.pageViews;
      current.engagedSessions += engagedSessions;
    }
  }
  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((point) => {
      const rates = computeRates(point.sessions, point.engagedSessions);
      return {
        key: point.key,
        label: point.label,
        activeUsers: point.activeUsers,
        newUsers: point.newUsers,
        sessions: point.sessions,
        pageViews: point.pageViews,
        bounceRate: rates.bounceRate,
        engagementRate: rates.engagementRate,
      };
    });
}

export function mergeSiteRows(rows: SiteBreakdownRow[]): SiteBreakdownRow[] {
  return rows.sort((a, b) => b.sessions - a.sessions);
}
