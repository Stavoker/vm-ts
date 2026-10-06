"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { lastCompletedIsoWeek } from "@/lib/analytics/date-range";
import { formatUsd } from "@/lib/analytics/format";
import { addUtcDays } from "@/lib/analytics/timezone";
import { DEFAULT_PACK_VISITS, TRAFFIC_CREATOR_PROFESSIONAL_PACKS } from "@/lib/analytics/traffic-cost";
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
  const [packVisits, setPackVisits] = useState(String(DEFAULT_PACK_VISITS));
  const { page, setPage, totalPages, slice, total } = usePagedList(reports);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    const query = selectedSiteId !== "all" ? `?siteId=${encodeURIComponent(selectedSiteId)}` : "";
    const response = await fetch(`/api/analytics/reports${query}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось загрузить отчёты");
    setReports(data.reports as AnalyticsReportRow[]);
    setLoading(false);
  }, [selectedSiteId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPage(0);
    load()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка");
          setLoading(false);
        }
      });
    const timer = setInterval(() => {
      void load(true).catch(() => undefined);
    }, 15_000);
    const onFocus = () => {
      void load(true).catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/analytics/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: modalSiteId, startDate, endDate, packVisits: Number(packVisits) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сформировать отчёт");
      setOpen(false);
      setPage(0);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
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
      if (!response.ok) throw new Error(data.error || "Не удалось пересоздать отчёт");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function removeReport(id: string) {
    if (!window.confirm("Удалить этот отчёт? Это действие нельзя отменить.")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/analytics/reports/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось удалить отчёт");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Еженедельные отчёты"
        extra={
          <Button
            type="button"
            onClick={() => {
              setModalSiteId(selectedSiteId === "all" ? sites[0]?.id || "" : selectedSiteId);
              setPackVisits(String(DEFAULT_PACK_VISITS));
              setOpen(true);
            }}
            disabled={!sites.length}
          >
            Сформировать PDF
          </Button>
        }
      />
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      {loading ? (
        <LoadingState label="Загрузка…" />
      ) : reports.length === 0 ? (
        <EmptyState title="Еженедельных отчётов пока нет." hint="Сформируйте 7-дневный PDF для подключённого сайта." />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
          <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="w-[24%]">Отчёт</th>
                <th>Сайт</th>
                <th>Период</th>
                <th>Пакет</th>
                <th>Создан</th>
                <th>Статус</th>
                <th className="text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((report) => (
                <tr key={report.id}>
                  <td className="font-medium">{report.site_name || "Еженедельный отчёт"} · еженедельный отчёт</td>
                  <td className="whitespace-nowrap">{report.site_name || report.site_id}</td>
                  <td className="whitespace-nowrap tabular-nums">{formatPeriod(report.period_start, report.period_end)}</td>
                  <td className="whitespace-nowrap">{report.pack_label || "—"}</td>
                  <td className="whitespace-nowrap">{report.generated_at ? formatDateTime(report.generated_at) : "—"}</td>
                  <td>
                    <span
                      className={`ui-chip ${
                        report.status === "completed"
                          ? "bg-[#e8f8ee] text-[#248a3d]"
                          : report.status === "failed"
                            ? "bg-[#ffe9eb] text-[#d70015]"
                            : "bg-[#f2f2f7] text-[#6e6e73]"
                      }`}
                    >
                      {statusLabel(report.status)}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
                      {report.status === "completed" ? (
                        <>
                          <a className="ui-btn ui-btn-ghost" href={`/api/analytics/reports/${report.id}/download`} target="_blank" rel="noreferrer">
                            Открыть
                          </a>
                          <a className="ui-btn ui-btn-secondary" href={`/api/analytics/reports/${report.id}/download`}>
                            Скачать
                          </a>
                        </>
                      ) : null}
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => void regenerate(report.id)}>
                        Пересоздать
                      </Button>
                      <Button type="button" variant="danger" disabled={busy} onClick={() => void removeReport(report.id)}>
                        Удалить
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
          <h3 className="text-[17px] font-semibold tracking-tight">Сформировать еженедельный PDF</h3>
          <div className="mt-4">
            <Field label="Сайт">
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
            <Field label="С">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setEndDate(addUtcDays(e.target.value, 6));
                }}
              />
            </Field>
            <Field label="По">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Пакет Traffic Creator">
              <Select value={packVisits} onChange={(e) => setPackVisits(e.target.value)}>
                {TRAFFIC_CREATOR_PROFESSIONAL_PACKS.map((pack) => (
                  <option key={pack.visits} value={pack.visits}>
                    {pack.label} · {formatUsd(pack.priceUsd)} · {formatUsd(pack.cpmUsd)} / 1 000
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Период должен быть ровно 7 дней. Стоимость недельного трафика считается по выбранному пакету.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={busy || !modalSiteId || !packVisits} onClick={() => void generate()}>
              {busy ? "Формируем…" : "Сформировать отчёт"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

function statusLabel(status: AnalyticsReportRow["status"]) {
  if (status === "completed") return "Готово";
  if (status === "failed") return "Ошибка";
  if (status === "generating") return "Формируется";
  return "Ожидает";
}

function formatPeriod(start: string, end: string) {
  return `${start.slice(0, 10)}\u00a0– ${end.slice(0, 10)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
