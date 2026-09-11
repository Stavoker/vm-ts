import { createServerSupabase } from "@/lib/supabase";
import { lastCompletedIsoWeek, previousPeriod, resolveDateRange } from "./date-range";
import { AnalyticsError } from "./errors";
import { getCampaigns, getCountries, getDevices, getLandingPages, getOverview, getSources, getTimeseries } from "./ga4-reports";
import { buildKeyInsights, meaningfulCampaigns } from "./insights";
import { generateWeeklyPdf, weeklyPdfFilename } from "./pdf-report";
import { getGa4Site, listGa4Sites } from "./sites";
import { getAppTimezone } from "./timezone";
import { buildTrafficCostSummary } from "./traffic-cost";
import type { AnalyticsQuery, AnalyticsReportRow, WeeklyReportData, WeeklyReportStatus } from "./types";

const STALE_GENERATING_MS = 10 * 60 * 1000;

type ReportRecord = {
  id: string;
  site_id: string;
  report_type: "weekly";
  period_start: string;
  period_end: string;
  file_name: string | null;
  pdf_base64?: string | null;
  generated_at: string | null;
  generated_by: string | null;
  status: WeeklyReportStatus;
  error_message: string | null;
  metadata_json: unknown;
  created_at: string;
  updated_at?: string;
  sites?: { name: string; url: string } | { name: string; url: string }[] | null;
};

export async function getWeeklyAnalyticsReportData(
  siteId: string,
  startDate: string,
  endDate: string,
): Promise<WeeklyReportData> {
  const site = await getGa4Site(siteId);
  const timezone = getAppTimezone();
  const currentRange = resolveDateRange({
    preset: "custom",
    from: startDate,
    to: endDate,
    granularity: "daily",
  });
  const previous = previousPeriod(currentRange);
  const previousRange = resolveDateRange({
    preset: "custom",
    from: previous.startDate,
    to: previous.endDate,
    granularity: "daily",
  });
  const currentQuery: AnalyticsQuery = {
    preset: "custom",
    from: startDate,
    to: endDate,
    granularity: "daily",
  };
  const previousQuery: AnalyticsQuery = {
    preset: "custom",
    from: previous.startDate,
    to: previous.endDate,
    granularity: "daily",
  };

  const [current, previousOverview, daily, countries, devices, sources, campaigns, landingPages] =
    await Promise.all([
      getOverview(siteId, { query: currentQuery, range: currentRange }),
      getOverview(siteId, { query: previousQuery, range: previousRange }),
      getTimeseries(siteId, { query: currentQuery, range: currentRange }),
      getCountries(siteId, { query: currentQuery, range: currentRange }),
      getDevices(siteId, { query: currentQuery, range: currentRange }),
      getSources(siteId, { query: currentQuery, range: currentRange }),
      getCampaigns(siteId, { query: currentQuery, range: currentRange }),
      getLandingPages(siteId, { query: currentQuery, range: currentRange }),
    ]);

  const data: WeeklyReportData = {
    site,
    periodStart: startDate,
    periodEnd: endDate,
    previousStart: previous.startDate,
    previousEnd: previous.endDate,
    generatedAt: new Date().toISOString(),
    timezone,
    current: current.metrics,
    previous: previousOverview.metrics,
    daily: daily.points,
    countries: countries.rows.slice(0, 10),
    devices: devices.rows,
    sources: sources.rows.slice(0, 10),
    campaigns: meaningfulCampaigns(campaigns.rows).slice(0, 10),
    landingPages: landingPages.rows.slice(0, 10),
    insights: [],
    trafficCost: buildTrafficCostSummary({
      sessions: current.metrics.sessions,
      users: current.metrics.totalUsers,
      previousSessions: previousOverview.metrics.sessions,
      previousUsers: previousOverview.metrics.totalUsers,
    }),
  };
  data.insights = buildKeyInsights(data);
  return data;
}

export async function listAnalyticsReports(siteId?: string): Promise<AnalyticsReportRow[]> {
  const supabase = createServerSupabase();
  let request = supabase
    .from("analytics_reports")
    .select("id, site_id, report_type, period_start, period_end, file_name, generated_at, generated_by, status, error_message, created_at, sites(name, url)")
    .eq("report_type", "weekly")
  .order("created_at", { ascending: false })
    .limit(100);
  if (siteId && siteId !== "all") request = request.eq("site_id", siteId);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReportRecord[]).map(toListRow);
}

export async function getAnalyticsReport(id: string): Promise<ReportRecord> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("analytics_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AnalyticsError("invalid_query", "Report not found", 404);
  return data as ReportRecord;
}

export async function generateWeeklyReport(input: {
  siteId: string;
  startDate: string;
  endDate: string;
  generatedBy?: string;
  regenerate?: boolean;
}): Promise<AnalyticsReportRow> {
  const site = await getGa4Site(input.siteId);
  const supabase = createServerSupabase();
  const existing = await findReport(input.siteId, input.startDate, input.endDate);
  if (existing?.status === "completed" && !input.regenerate) {
    return toListRow(existing);
  }
  if (existing?.status === "generating" && !isStale(existing)) {
    throw new AnalyticsError("invalid_query", "Report generation is already in progress", 409);
  }

  let reportId = existing?.id;
  if (existing) {
    const { error } = await supabase
      .from("analytics_reports")
      .update({
        status: "generating",
        error_message: null,
        generated_by: input.generatedBy || "manual",
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase
      .from("analytics_reports")
      .insert({
        site_id: input.siteId,
        report_type: "weekly",
        period_start: input.startDate,
        period_end: input.endDate,
        status: "generating",
        generated_by: input.generatedBy || "manual",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    reportId = (data as ReportRecord).id;
  }

  try {
    const reportData = await getWeeklyAnalyticsReportData(input.siteId, input.startDate, input.endDate);
    const pdf = await generateWeeklyPdf(reportData);
    const fileName = weeklyPdfFilename(site, input.startDate, input.endDate);
    const { data, error } = await supabase
      .from("analytics_reports")
      .update({
        status: "completed",
        file_name: fileName,
        pdf_base64: pdf.toString("base64"),
        generated_at: new Date().toISOString(),
        generated_by: input.generatedBy || "manual",
        error_message: null,
        metadata_json: {
          timezone: reportData.timezone,
          sessions: reportData.current.sessions,
          users: reportData.current.totalUsers,
          traffic_cpm_usd: reportData.trafficCost.professionalCpmUsd,
          traffic_cost_sessions_usd: reportData.trafficCost.sessionsCostUsd,
          traffic_cost_users_usd: reportData.trafficCost.usersCostUsd,
        },
      })
      .eq("id", reportId)
      .select("id, site_id, report_type, period_start, period_end, file_name, generated_at, generated_by, status, error_message, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { ...(data as AnalyticsReportRow), site_name: site.name, site_url: site.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate report";
    await supabase
      .from("analytics_reports")
      .update({ status: "failed", error_message: message })
      .eq("id", reportId);
    throw error;
  }
}

export async function generateScheduledWeeklyReports(now = new Date()) {
  const week = lastCompletedIsoWeek(now);
  const sites = await listGa4Sites();
  const results: { siteId: string; siteName: string; status: string; error?: string }[] = [];
  for (const site of sites) {
    try {
      const existing = await findReport(site.id, week.startDate, week.endDate);
      if (existing?.status === "completed") {
        results.push({ siteId: site.id, siteName: site.name, status: "skipped" });
        continue;
      }
      const row = await generateWeeklyReport({
        siteId: site.id,
        startDate: week.startDate,
        endDate: week.endDate,
        generatedBy: "schedule",
        regenerate: existing?.status === "failed" || isStale(existing),
      });
      results.push({ siteId: site.id, siteName: site.name, status: row.status });
    } catch (error) {
      results.push({
        siteId: site.id,
        siteName: site.name,
        status: "failed",
        error: error instanceof Error ? error.message : "Failed",
      });
    }
  }
  return { week, generated: results };
}

async function findReport(siteId: string, startDate: string, endDate: string): Promise<ReportRecord | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("analytics_reports")
    .select("*")
    .eq("site_id", siteId)
    .eq("report_type", "weekly")
    .eq("period_start", startDate)
    .eq("period_end", endDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ReportRecord) || null;
}

function isStale(row?: ReportRecord | null): boolean {
  if (!row || row.status !== "generating") return false;
  const updated = Date.parse(row.updated_at || row.created_at);
  return Number.isFinite(updated) && Date.now() - updated > STALE_GENERATING_MS;
}

function toListRow(row: ReportRecord): AnalyticsReportRow {
  const site = Array.isArray(row.sites) ? row.sites[0] : row.sites;
  return {
    id: row.id,
    site_id: row.site_id,
    site_name: site?.name,
    site_url: site?.url,
    report_type: "weekly",
    period_start: row.period_start,
    period_end: row.period_end,
    file_name: row.file_name,
    generated_at: row.generated_at,
    generated_by: row.generated_by,
    status: row.status,
    error_message: row.error_message,
    created_at: row.created_at,
  };
}
