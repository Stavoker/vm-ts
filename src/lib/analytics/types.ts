import type { TrafficCostSummary } from "./traffic-cost";

export type DatePreset =
  | "today"
  | "last_24h"
  | "last_36h"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "last_90d"
  | "this_month"
  | "previous_month"
  | "custom";

export type ChartGranularity = "auto" | "hourly" | "daily" | "weekly";

export type BounceDimension = "country" | "device" | "source" | "landingPage" | "campaign";

export type AnalyticsFilters = {
  country?: string;
  device?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  page?: string;
};

export type AnalyticsQuery = AnalyticsFilters & {
  preset: DatePreset;
  from?: string;
  to?: string;
  granularity: ChartGranularity;
  bounceDimension?: BounceDimension;
  fresh?: boolean;
};

export type ResolvedDateRange = {
  preset: DatePreset;
  startDate: string;
  endDate: string;
  startDateHour?: string;
  endDateHour?: string;
  usesHourly: boolean;
  granularity: Exclude<ChartGranularity, "auto">;
  label: string;
  warning?: string;
  timezone: string;
};

export type OverviewMetrics = {
  activeUsers: number;
  totalUsers: number;
  newUsers: number;
  sessions: number;
  engagedSessions: number;
  pageViews: number;
  bounceRate: number;
  engagementRate: number;
  viewsPerSession: number;
  averageSessionDuration: number;
};

export type TimeseriesPoint = {
  key: string;
  label: string;
  activeUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  bounceRate: number;
  engagementRate: number;
};

export type BreakdownRow = {
  keys: Record<string, string>;
  label: string;
  activeUsers: number;
  totalUsers: number;
  sessions: number;
  pageViews: number;
  engagedSessions: number;
  bounceRate: number;
  engagementRate: number;
  sessionsShare: number;
  usersShare: number;
};

export type RealtimeSnapshot = {
  activeUsers: number;
  pageViews: number;
  windowLabel: string;
  byCountry: { label: string; activeUsers: number }[];
  byDevice: { label: string; activeUsers: number }[];
};

export type SiteBreakdownRow = {
  siteId: string;
  siteName: string;
  domain: string;
  activeUsers: number;
  sessions: number;
  pageViews: number;
  bounceRate: number;
  engagementRate: number;
  error?: string;
};

export type AnalyticsSite = {
  id: string;
  name: string;
  url: string;
  domain: string;
  ga4_property_id: string;
  ga4_measurement_id: string | null;
  ga4_enabled: boolean;
};

export type AnalyticsErrorCode =
  | "missing_credentials"
  | "not_connected"
  | "permission_denied"
  | "invalid_property"
  | "quota"
  | "no_data"
  | "invalid_query"
  | "unknown";

export type WeeklyReportStatus = "pending" | "generating" | "completed" | "failed";

export type AnalyticsReportRow = {
  id: string;
  site_id: string;
  site_name?: string;
  site_url?: string;
  report_type: "weekly";
  period_start: string;
  period_end: string;
  file_name: string | null;
  generated_at: string | null;
  generated_by: string | null;
  status: WeeklyReportStatus;
  error_message: string | null;
  created_at: string;
};

export type WeeklyReportData = {
  site: AnalyticsSite;
  periodStart: string;
  periodEnd: string;
  previousStart: string;
  previousEnd: string;
  generatedAt: string;
  timezone: string;
  current: OverviewMetrics;
  previous: OverviewMetrics;
  daily: TimeseriesPoint[];
  countries: BreakdownRow[];
  devices: BreakdownRow[];
  sources: BreakdownRow[];
  campaigns: BreakdownRow[];
  landingPages: BreakdownRow[];
  insights: string[];
  trafficCost: TrafficCostSummary;
};

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  last_24h: "Last 24 Hours",
  last_36h: "Last 36 Hours",
  yesterday: "Yesterday",
  last_7d: "Last 7 Days",
  last_14d: "Last 14 Days",
  last_30d: "Last 30 Days",
  last_90d: "Last 90 Days",
  this_month: "This Month",
  previous_month: "Previous Month",
  custom: "Custom Range",
};
