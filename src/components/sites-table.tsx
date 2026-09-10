"use client";

import { Globe, Trash2 } from "lucide-react";
import { useState } from "react";
import { Ga4SiteSettings } from "@/components/analytics/ga4-settings";
import { StatusBadge } from "@/components/status-badge";
import { Pagination, usePagedList } from "@/components/ui/pagination";
import { Alert, Button, EmptyState, Select } from "@/components/ui/primitives";
import type { Site, SiteStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

type Props = {
  sites: Site[];
  onChanged: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SitesTable({ sites, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { page, setPage, totalPages, slice, total } = usePagedList(sites);

  async function removeSite(id: string) {
    if (!confirm("Удалить сайт из списка?")) return;
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось удалить");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  async function setManualStatus(id: string, status: SiteStatus) {
    const reason =
      status === "online"
        ? null
        : prompt("Причина статуса (можно оставить пустым):") || null;

    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, status_reason: reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось обновить");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error ? <Alert className="mb-3">{error}</Alert> : null}

      <div className="ui-table-wrap">
        {sites.length === 0 ? (
          <EmptyState
            icon={<Globe size={28} />}
            title="Нет сайтов"
            hint="Добавьте первый сайт, чтобы начать мониторинг."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Сайт</th>
                  <th>Статус</th>
                  <th>HTTP</th>
                  <th>Причина</th>
                  <th>Проверено</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((site) => (
                  <tr key={site.id}>
                    <td className="align-middle">
                      <div className="font-medium text-[var(--text)]">{site.name}</div>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[var(--muted)] hover:text-[var(--accent)] hover:underline"
                      >
                        {site.url}
                      </a>
                    </td>
                    <td className="align-middle">
                      <StatusBadge status={site.status} />
                    </td>
                    <td className="align-middle tabular-nums text-[var(--muted)]">
                      {site.http_status ?? "—"}
                      {site.response_time_ms != null ? (
                        <div className="text-xs text-[var(--muted)]">{site.response_time_ms} ms</div>
                      ) : null}
                    </td>
                    <td className="max-w-xs align-middle text-[var(--muted)]">
                      {site.status_reason || "—"}
                    </td>
                    <td className="whitespace-nowrap align-middle text-[var(--muted)]">
                      {formatDate(site.last_checked_at)}
                    </td>
                    <td className="align-middle">
                      <div className="flex flex-wrap items-center gap-2">
                        <Ga4SiteSettings site={site} onChanged={onChanged} />
                        <div className="w-[140px]">
                        <Select
                          disabled={busyId === site.id}
                          defaultValue=""
                          onChange={(e) => {
                            const value = e.target.value as SiteStatus;
                            e.target.value = "";
                            if (value) void setManualStatus(site.id, value);
                          }}
                        >
                          <option value="" disabled>
                            Статус…
                          </option>
                          {(Object.keys(STATUS_LABELS) as SiteStatus[]).map((status) => (
                            <option key={status} value={status}>
                              {STATUS_LABELS[status]}
                            </option>
                          ))}
                        </Select>
                        </div>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busyId === site.id}
                          onClick={() => removeSite(site.id)}
                        >
                          <Trash2 size={14} />
                          Удалить
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
