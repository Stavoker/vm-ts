"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { lastCompletedIsoWeek } from "@/lib/analytics/date-range";
import { addUtcDays } from "@/lib/analytics/timezone";
import type { AnalyticsReportRow } from "@/lib/analytics/types";
import type { Site } from "@/lib/types";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, LoadingState, Modal, Select } from "@/components/ui/primitives";
import { Pagination, usePagedList } from "@/components/ui/pagination";

type Props = {
  sites: Site[];
  selectedSiteId: string;
};

export function WeeklyReportsSection({ sites, selectedSiteId }: Props) {
  const [reports, setReports] = useState<AnalyticsReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const defaultWeek = useMemo(() => lastCompletedIsoWeek(), []);
  const [modalSiteId, setModalSiteId] = useState("");
  const [startDate, setStartDate] = useState(defaultWeek.startDate);
  const [endDate, setEndDate] = useState(defaultWeek.endDate);
  const { page, setPage, totalPages, slice, total } = usePagedList(reports);

  const load = useCallback(async () => {
    setError(null);
    const query = selectedSiteId !== "all" ? `?siteId=${selectedSiteId}` : "";
    const response = await fetch(`/api/analytics/reports${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load reports");
    setReports(data.reports as AnalyticsReportRow[]);
    setLoading(false);
  }, [selectedSiteId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analytics/reports${selectedSiteId !== "all" ? `?siteId=${selectedSiteId}` : ""}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load reports");
        if (!cancelled) {
          setReports(data.reports as AnalyticsReportRow[]);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSiteId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/analytics/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: modalSiteId, startDate, endDate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate report");
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/analytics/reports/${id}/regenerate`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to regenerate");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Weekly Reports"
        extra={
          <Button
            type="button"
            onClick={() => {
              setModalSiteId(selectedSiteId === "all" ? sites[0]?.id || "" : selectedSiteId);
              setOpen(true);
            }}
            disabled={!sites.length}
          >
            Generate Weekly PDF
          </Button>
        }
      />
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      {loading ? (
        <LoadingState label="Loading…" />
      ) : reports.length === 0 ? (
        <EmptyState title="No weekly reports yet." hint="Generate a 7-day PDF for a connected site." />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
          <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="w-[24%]">Report</th>
                <th>Website</th>
                <th>Period</th>
                <th>Generated At</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((report) => (
                <tr key={report.id}>
                  <td className="font-medium">{report.site_name || "Weekly Traffic Report"} Weekly Report</td>
                  <td className="whitespace-nowrap">{report.site_name || report.site_id}</td>
                  <td className="whitespace-nowrap tabular-nums">{formatPeriod(report.period_start, report.period_end)}</td>
                  <td className="whitespace-nowrap">{report.generated_at ? formatDateTime(report.generated_at) : "—"}</td>
                  <td>
                    <span
                      className={`ui-chip capitalize ${
                        report.status === "completed"
                          ? "bg-[#e8f8ee] text-[#248a3d]"
                          : report.status === "failed"
                            ? "bg-[#ffe9eb] text-[#d70015]"
                            : "bg-[#f2f2f7] text-[#6e6e73]"
                      }`}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
                      {report.status === "completed" ? (
                        <>
                          <a className="ui-btn ui-btn-ghost" href={`/api/analytics/reports/${report.id}/download`} target="_blank" rel="noreferrer">
                            View
                          </a>
                          <a className="ui-btn ui-btn-secondary" href={`/api/analytics/reports/${report.id}/download`}>
                            Download
                          </a>
                        </>
                      ) : null}
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => void regenerate(report.id)}>
                        Regenerate
                      </Button>
                    </div>
                    {report.status === "failed" && report.error_message ? (
                      <div className="mt-1 text-right text-xs text-[var(--danger)]">{report.error_message}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </div>
      )}

      {open ? (
        <Modal onClose={() => setOpen(false)}>
          <h3 className="text-[17px] font-semibold tracking-tight">Generate Weekly PDF</h3>
          <div className="mt-4">
            <Field label="Website">
              <Select value={modalSiteId} onChange={(e) => setModalSiteId(e.target.value)}>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="From">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setEndDate(addUtcDays(e.target.value, 6));
                }}
              />
            </Field>
            <Field label="To">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">Must be exactly 7 days. Previous week is included for comparison.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !modalSiteId} onClick={() => void generate()}>
              {busy ? "Generating…" : "Generate Report"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

function formatPeriod(start: string, end: string) {
  return `${start.slice(0, 10)}\u00a0– ${end.slice(0, 10)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
