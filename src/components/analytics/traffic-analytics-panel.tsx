"use client";

import {
  Activity,
  Clock3,
  Eye,
  Heart,
  Layers,
  MousePointerClick,
  RefreshCw,
  RotateCcw,
  TrendingDown,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DATE_PRESET_LABELS, type BounceDimension, type BreakdownRow, type ChartGranularity, type DatePreset, type OverviewMetrics, type RealtimeSnapshot, type SiteBreakdownRow, type TimeseriesPoint } from "@/lib/analytics/types";
import { formatDuration, formatNumber, formatPercent } from "@/lib/analytics/format";
import type { Site } from "@/lib/types";
import { StatCard } from "@/components/ui/stat-card";
import { PAGE_SIZE, Pagination, usePagedList } from "@/components/ui/pagination";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, LoadingState, Select } from "@/components/ui/primitives";
import { CHART_METRICS, DeviceBars, HorizontalBars, TrafficLineChart, type ChartMetricKey } from "./charts";
import { WeeklyReportsSection } from "./weekly-reports-section";

type Props = {
  sites: Site[];
};

type SectionState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

const emptySection = { loading: true, data: null, error: null };

const KPI_HELP: Record<string, string> = {
  now: "Realtime active users from GA4 Realtime API, normally representing activity during approximately the last 30 minutes.",
  active: "Unique active users during the selected period.",
  total: "Total users recorded by GA4 for the selected period.",
  neu: "Users who interacted with the site for the first time.",
  sessions: "Sessions recorded by GA4. Not the same as users or page views.",
  views: "Total page/screen views, including repeated views.",
  bounce: "Percentage of sessions that were not engaged sessions.",
  engagement: "Percentage of engaged sessions.",
  vps: "Average page/screen views per session.",
  duration: "Average session duration reported by GA4.",
};

export function TrafficAnalyticsPanel({ sites }: Props) {
  const ga4Sites = useMemo(
    () => sites.filter((site) => site.ga4_enabled && site.ga4_property_id),
    [sites],
  );
  const [siteId, setSiteId] = useState("all");
  const [preset, setPreset] = useState<DatePreset>("last_7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [country, setCountry] = useState("");
  const [device, setDevice] = useState("");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [page, setPage] = useState("");
  const [granularity, setGranularity] = useState<ChartGranularity>("auto");
  const [chartMetrics, setChartMetrics] = useState<ChartMetricKey[]>(["sessions", "activeUsers", "pageViews"]);
  const [bounceDimension, setBounceDimension] = useState<BounceDimension>("country");
  const [countrySearch, setCountrySearch] = useState("");
  const [countrySort, setCountrySort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "sessions",
    dir: "desc",
  });
  const [countryPage, setCountryPage] = useState(0);
  const [fresh, setFresh] = useState(0);
  const [realtime, setRealtime] = useState<SectionState<RealtimeSnapshot>>(emptySection);
  const [overview, setOverview] = useState<SectionState<{ metrics: OverviewMetrics; sites: SiteBreakdownRow[]; range?: { label: string; warning?: string } }>>(emptySection);
  const [timeseries, setTimeseries] = useState<SectionState<{ points: TimeseriesPoint[]; range?: { label: string; warning?: string } }>>(emptySection);
  const [countries, setCountries] = useState<SectionState<{ rows: BreakdownRow[] }>>(emptySection);
  const [devices, setDevices] = useState<SectionState<{ rows: BreakdownRow[] }>>(emptySection);
  const [sources, setSources] = useState<SectionState<{ rows: BreakdownRow[] }>>(emptySection);
  const [campaigns, setCampaigns] = useState<SectionState<{ rows: BreakdownRow[] }>>(emptySection);
  const [landing, setLanding] = useState<SectionState<{ rows: BreakdownRow[] }>>(emptySection);
  const [bounce, setBounce] = useState<SectionState<{ rows: BreakdownRow[] }>>(emptySection);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("preset", preset);
    if (preset === "custom" && from) params.set("from", from);
    if (preset === "custom" && to) params.set("to", to);
    if (country) params.set("country", country);
    if (device) params.set("device", device);
    if (source) params.set("source", source);
    if (medium) params.set("medium", medium);
    if (campaign) params.set("campaign", campaign);
    if (page) params.set("page", page);
    params.set("granularity", granularity);
    if (fresh) params.set("fresh", "1");
    return params.toString();
  }, [preset, from, to, country, device, source, medium, campaign, page, granularity, fresh]);

  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const loadJson = useCallback(async <T,>(url: string, signal: AbortSignal): Promise<T> => {
    const response = await fetch(url, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data as T;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async <T,>(
      report: string,
      setter: (state: SectionState<T>) => void,
      extra = "",
    ) => {
      setter({ loading: true, data: null, error: null });
      try {
        const data = await loadJson<T>(`/api/analytics/${siteId}/${report}?${debouncedQuery}${extra}`, controller.signal);
        setter({ loading: false, data, error: null });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setter({ loading: false, data: null, error: error instanceof Error ? error.message : "Error" });
      }
    };
    void load("overview", setOverview);
    void load("timeseries", setTimeseries);
    void load("countries", setCountries);
    void load("devices", setDevices);
    void load("sources", setSources);
    void load("campaigns", setCampaigns);
    void load("landing-pages", setLanding);
    void load("bounce", setBounce, `&bounceDimension=${bounceDimension}`);
    return () => controller.abort();
  }, [siteId, debouncedQuery, bounceDimension, loadJson]);

  useEffect(() => {
    let cancelled = false;
    async function loadRealtime() {
      setRealtime((current) => ({ ...current, loading: current.data == null, error: null }));
      try {
        const data = await loadJson<RealtimeSnapshot>(
          `/api/analytics/${siteId}/realtime?${debouncedQuery}`,
          new AbortController().signal,
        );
        if (!cancelled) setRealtime({ loading: false, data, error: null });
      } catch (error) {
        if (!cancelled) {
          setRealtime({
            loading: false,
            data: null,
            error: error instanceof Error ? error.message : "Error",
          });
        }
      }
    }
    void loadRealtime();
    const timer = setInterval(() => void loadRealtime(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [siteId, debouncedQuery, loadJson]);

  function resetFilters() {
    setPreset("last_7d");
    setFrom("");
    setTo("");
    setCountry("");
    setDevice("");
    setSource("");
    setMedium("");
    setCampaign("");
    setPage("");
    setGranularity("auto");
    setCountrySearch("");
  }

  const metrics = overview.data?.metrics;
  const countryRows = useMemo(() => {
    const rows = countries.data?.rows ?? [];
    const filtered = countrySearch
      ? rows.filter((row) => row.label.toLowerCase().includes(countrySearch.toLowerCase()))
      : rows;
    const sorted = [...filtered].sort((a, b) => {
      const left = valueOf(a, countrySort.key);
      const right = valueOf(b, countrySort.key);
      if (typeof left === "string" && typeof right === "string") {
        return countrySort.dir === "asc" ? left.localeCompare(right) : right.localeCompare(left);
      }
      return countrySort.dir === "asc" ? Number(left) - Number(right) : Number(right) - Number(left);
    });
    return sorted;
  }, [countries.data, countrySearch, countrySort]);

  const countryPages = Math.max(1, Math.ceil(countryRows.length / PAGE_SIZE));
  const safeCountryPage = Math.min(countryPage, countryPages - 1);
  const pagedCountries = countryRows.slice(safeCountryPage * PAGE_SIZE, safeCountryPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          <FilterSelect
            label="Website"
            value={siteId}
            onChange={setSiteId}
            options={[
              { value: "all", label: "All Websites" },
              ...sites.map((site) => ({
                value: site.id,
                label: site.ga4_enabled && site.ga4_property_id ? site.name : `${site.name} (no GA4)`,
              })),
            ]}
          />
          <FilterSelect
            label="Date Range"
            value={preset}
            onChange={(value) => setPreset(value as DatePreset)}
            options={Object.entries(DATE_PRESET_LABELS).map(([value, label]) => ({ value, label }))}
          />
          {preset === "custom" ? (
            <>
              <Field label="From">
                <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To">
                <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </>
          ) : null}
          <Field label="Country">
            <Input placeholder="All countries" value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
          <Field label="Device">
            <Select value={device} onChange={(e) => setDevice(e.target.value)}>
              <option value="">All devices</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
            </Select>
          </Field>
          <Field label="Source">
            <Input placeholder="All sources" value={source} onChange={(e) => setSource(e.target.value)} />
          </Field>
          <Field label="Medium">
            <Input placeholder="All mediums" value={medium} onChange={(e) => setMedium(e.target.value)} />
          </Field>
          <Field label="Campaign">
            <Input placeholder="All campaigns" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
          </Field>
          <Field label="Landing page">
            <Input placeholder="All pages" value={page} onChange={(e) => setPage(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={resetFilters}>
            <RotateCcw size={14} />
            Reset Filters
          </Button>
          <Button type="button" onClick={() => setFresh((value) => value + 1)}>
            <RefreshCw size={14} />
            Refresh
          </Button>
          {overview.data?.range?.label ? (
            <span className="text-xs text-[var(--muted)]">
              Period: {overview.data.range.label}
              {overview.data.range.warning ? ` · ${overview.data.range.warning}` : ""}
            </span>
          ) : null}
        </div>
        {ga4Sites.length === 0 ? (
          <Alert tone="warn" className="mt-4">
            No GA4 property connected. Add a Property ID on a site, then enable GA4.
          </Alert>
        ) : null}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Active Users Now" value={formatNumber(realtime.data?.activeUsers ?? 0)} hint="Last 30 minutes" help={KPI_HELP.now} loading={realtime.loading} error={realtime.error} icon={Activity} tint="blue" />
        <StatCard title="Active Users" value={formatNumber(metrics?.activeUsers ?? 0)} hint="Selected period" help={KPI_HELP.active} loading={overview.loading} error={overview.error} icon={Users} tint="blue" />
        <StatCard title="Total Users" value={formatNumber(metrics?.totalUsers ?? 0)} help={KPI_HELP.total} loading={overview.loading} error={overview.error} icon={UserRound} tint="gray" />
        <StatCard title="New Users" value={formatNumber(metrics?.newUsers ?? 0)} help={KPI_HELP.neu} loading={overview.loading} error={overview.error} icon={UserPlus} tint="green" />
        <StatCard title="Sessions / Visits" value={formatNumber(metrics?.sessions ?? 0)} help={KPI_HELP.sessions} loading={overview.loading} error={overview.error} icon={MousePointerClick} tint="purple" />
        <StatCard title="Page Views" value={formatNumber(metrics?.pageViews ?? 0)} help={KPI_HELP.views} loading={overview.loading} error={overview.error} icon={Eye} tint="blue" />
        <StatCard title="Bounce Rate" value={formatPercent(metrics?.bounceRate ?? 0)} help={KPI_HELP.bounce} loading={overview.loading} error={overview.error} icon={TrendingDown} tint="orange" />
        <StatCard title="Engagement Rate" value={formatPercent(metrics?.engagementRate ?? 0)} help={KPI_HELP.engagement} loading={overview.loading} error={overview.error} icon={Heart} tint="green" />
        <StatCard title="Views / Session" value={formatNumber(metrics?.viewsPerSession ?? 0, 2)} help={KPI_HELP.vps} loading={overview.loading} error={overview.error} icon={Layers} tint="gray" />
        <StatCard title="Avg Session / Engagement Time" value={formatDuration(metrics?.averageSessionDuration ?? 0)} help={KPI_HELP.duration} loading={overview.loading} error={overview.error} icon={Clock3} tint="purple" />
      </div>

      {siteId === "all" && overview.data?.sites?.length ? (
        <Card>
          <CardHeader title="All Websites" />
          <p className="mb-3 text-xs text-[var(--muted)]">
            User totals are summed per GA4 property and may over-count people who visited multiple sites. Bounce and engagement are session-weighted.
          </p>
          <Table
            columns={["Website", "Users", "Sessions", "Views", "Bounce Rate", "Engagement Rate"]}
            rows={overview.data.sites.map((row) => [
              row.siteName,
              formatNumber(row.activeUsers),
              formatNumber(row.sessions),
              formatNumber(row.pageViews),
              row.error || formatPercent(row.bounceRate),
              row.error || formatPercent(row.engagementRate),
            ])}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Traffic Over Time"
                          extra={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[140px]">
                <Select value={granularity} onChange={(e) => setGranularity(e.target.value as ChartGranularity)}>
                  <option value="auto">Auto</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </Select>
              </div>
              <div className="ui-seg">
                {CHART_METRICS.map((metric) => (
                  <button
                    key={metric.key}
                    type="button"
                    data-active={chartMetrics.includes(metric.key)}
                    className="ui-seg-btn"
                    onClick={() =>
                      setChartMetrics((current) =>
                        current.includes(metric.key)
                          ? current.filter((item) => item !== metric.key)
                          : [...current, metric.key],
                      )
                    }
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            </div>
          }
        />
        <SectionBody state={timeseries}>
          <TrafficLineChart points={timeseries.data?.points ?? []} metrics={chartMetrics.length ? chartMetrics : ["sessions"]} />
        </SectionBody>
      </Card>

      <Card>
        <CardHeader
          title="Traffic by Country"
          extra={
            <div className="flex gap-2">
              <div className="w-[180px]">
                <Input value={countrySearch} onChange={(e) => { setCountrySearch(e.target.value); setCountryPage(0); }} placeholder="Search country" />
              </div>
              <Button type="button" variant="secondary" onClick={() => exportCsv("countries.csv", countryRows)}>
                CSV
              </Button>
            </div>
          }
        />
        <SectionBody state={countries} empty={!countryRows.length}>
          <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
            <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  {["Country", "Active Users", "Total Users", "Sessions", "Page Views", "Bounce Rate", "Engagement Rate", "Sessions %", "Users %"].map((label) => (
                    <th key={label} className="cursor-pointer" onClick={() => toggleSort(label)}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedCountries.map((row) => (
                  <tr key={row.label}>
                    <td>
                      <button type="button" className="text-left text-[var(--accent)] hover:underline" onClick={() => setCountry(row.label)}>
                        {row.label}
                      </button>
                    </td>
                    <td className="tabular-nums">{formatNumber(row.activeUsers)}</td>
                    <td className="tabular-nums">{formatNumber(row.totalUsers)}</td>
                    <td className="tabular-nums">{formatNumber(row.sessions)}</td>
                    <td className="tabular-nums">{formatNumber(row.pageViews)}</td>
                    <td className="tabular-nums">{formatPercent(row.bounceRate)}</td>
                    <td className="tabular-nums">{formatPercent(row.engagementRate)}</td>
                    <td className="tabular-nums">{formatPercent(row.sessionsShare)}</td>
                    <td className="tabular-nums">{formatPercent(row.usersShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          <Pagination
            page={safeCountryPage}
            totalPages={countryPages}
            total={countryRows.length}
            onPage={setCountryPage}
          />
          </div>
        </SectionBody>
      </Card>

      <Card>
        <CardHeader
          title="Bounce Rate Analysis"
          extra={
            <div className="w-[180px]">
              <Select value={bounceDimension} onChange={(e) => setBounceDimension(e.target.value as BounceDimension)}>
                <option value="country">Country</option>
                <option value="device">Device</option>
                <option value="source">Source / Medium</option>
                <option value="landingPage">Landing Page</option>
                <option value="campaign">Campaign</option>
              </Select>
            </div>
          }
        />
        <div className="mb-4 text-sm text-[var(--text)]">
          Overall bounce rate: <span className="font-semibold tabular-nums">{formatPercent(metrics?.bounceRate ?? 0)}</span>
        </div>
        <SectionBody state={bounce}>
          <HorizontalBars rows={(bounce.data?.rows ?? []).slice(0, PAGE_SIZE).map((row) => ({ label: row.label, value: row.bounceRate * 100 }))} />
          <div className="mt-4">
            <Table
              columns={["Breakdown", "Sessions", "Bounce Rate", "Engagement Rate"]}
              rows={(bounce.data?.rows ?? []).map((row) => [
                row.label,
                formatNumber(row.sessions),
                formatPercent(row.bounceRate),
                formatPercent(row.engagementRate),
              ])}
            />
          </div>
        </SectionBody>
      </Card>

      <Card>
        <CardHeader title="Devices" />
        <SectionBody state={devices}>
          <DeviceBars
            rows={(devices.data?.rows ?? []).map((row) => ({
              label: row.label,
              users: row.totalUsers || row.activeUsers,
              sessions: row.sessions,
              bounceRate: row.bounceRate,
              engagementRate: row.engagementRate,
            }))}
          />
        </SectionBody>
      </Card>

      <Card>
        <CardHeader title="Traffic Sources" />
        <SectionBody state={sources}>
          <Table
            columns={["Source / Medium", "Users", "Sessions", "Views", "Bounce Rate", "Engagement Rate"]}
            rows={(sources.data?.rows ?? []).map((row) => [
              row.label,
              formatNumber(row.totalUsers || row.activeUsers),
              formatNumber(row.sessions),
              formatNumber(row.pageViews),
              formatPercent(row.bounceRate),
              formatPercent(row.engagementRate),
            ])}
            onRowClick={(label) => {
              const [nextSource, nextMedium] = label.split(" / ");
              if (nextSource) setSource(nextSource);
              if (nextMedium) setMedium(nextMedium);
            }}
          />
        </SectionBody>
      </Card>

      <Card>
        <CardHeader title="Campaign Analytics" />
        <SectionBody state={campaigns} empty={!(campaigns.data?.rows.length)}>
          <Table
            columns={["Campaign Name", "Source", "Medium", "Users", "Sessions", "Views", "Bounce Rate", "Engagement Rate"]}
            rows={(campaigns.data?.rows ?? []).map((row) => [
              row.keys.sessionCampaignName || row.label,
              row.keys.sessionSource || "—",
              row.keys.sessionMedium || "—",
              formatNumber(row.totalUsers || row.activeUsers),
              formatNumber(row.sessions),
              formatNumber(row.pageViews),
              formatPercent(row.bounceRate),
              formatPercent(row.engagementRate),
            ])}
            onRowClick={(label) => setCampaign(label)}
          />
        </SectionBody>
      </Card>

      <Card>
        <CardHeader title="Top Landing Pages" />
        <SectionBody state={landing}>
          <Table
            columns={["Landing Page", "Users", "Sessions", "Views", "Bounce Rate", "Engagement Rate"]}
            rows={(landing.data?.rows ?? []).map((row) => [
              row.label,
              formatNumber(row.totalUsers || row.activeUsers),
              formatNumber(row.sessions),
              formatNumber(row.pageViews),
              formatPercent(row.bounceRate),
              formatPercent(row.engagementRate),
            ])}
            onRowClick={(label) => setPage(label)}
          />
        </SectionBody>
      </Card>

      <WeeklyReportsSection sites={ga4Sites} selectedSiteId={siteId} />
    </div>
  );

  function toggleSort(label: string) {
    const map: Record<string, string> = {
      Country: "label",
      "Active Users": "activeUsers",
      "Total Users": "totalUsers",
      Sessions: "sessions",
      "Page Views": "pageViews",
      "Bounce Rate": "bounceRate",
      "Engagement Rate": "engagementRate",
      "Sessions %": "sessionsShare",
      "Users %": "usersShare",
    };
    const key = map[label] || "sessions";
    setCountrySort((current) => ({
      key,
      dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
    }));
  }
}

function valueOf(row: BreakdownRow, key: string): string | number {
  if (key === "label") return row.label;
  return Number((row as unknown as Record<string, unknown>)[key] ?? 0);
}

function SectionBody({
  state,
  empty,
  children,
}: {
  state: SectionState<unknown>;
  empty?: boolean;
  children: ReactNode;
}) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.loading) return <LoadingState label="Loading…" />;
  if (empty) return <EmptyState title="No analytics data for selected period" hint="Try a different date range or reset filters." />;
  return <>{children}</>;
}

function Table({
  columns,
  rows,
  onRowClick,
}: {
  columns: string[];
  rows: string[][];
  onRowClick?: (firstCell: string) => void;
}) {
  const { page, setPage, totalPages, slice, total } = usePagedList(rows);
  if (rows.length === 0) return <EmptyState title="No analytics data for selected period" />;
  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
      <div className="overflow-x-auto">
        <table className="ui-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className={cellIndex === 0 ? "" : "tabular-nums"}>
                    {cellIndex === 0 && onRowClick ? (
                      <button type="button" className="text-left text-[var(--accent)] hover:underline" onClick={() => onRowClick(cell)}>
                        {cell}
                      </button>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function exportCsv(filename: string, rows: BreakdownRow[]) {
  const header = ["Country", "Active Users", "Total Users", "Sessions", "Page Views", "Bounce Rate", "Engagement Rate", "Sessions %", "Users %"];
  const body = rows.map((row) => [
    row.label,
    row.activeUsers,
    row.totalUsers,
    row.sessions,
    row.pageViews,
    formatPercent(row.bounceRate),
    formatPercent(row.engagementRate),
    formatPercent(row.sessionsShare),
    formatPercent(row.usersShare),
  ]);
  const csv = [header, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
