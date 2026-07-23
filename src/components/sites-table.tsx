"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
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

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function SitesTable({ sites, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-x-auto border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Сайт</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">HTTP</th>
              <th className="px-4 py-3">Причина</th>
              <th className="px-4 py-3">Проверено</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sites.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  Нет сайтов
                </td>
              </tr>
            ) : (
              sites.map((site) => (
                <tr
                  key={site.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 align-middle">
                    <div className="font-medium text-gray-900">{site.name}</div>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
                    >
                      {site.url}
                    </a>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <StatusBadge status={site.status} />
                  </td>
                  <td className="px-4 py-3 align-middle tabular-nums text-gray-600">
                    {site.http_status ?? "—"}
                    {site.response_time_ms != null ? (
                      <div className="text-xs text-gray-400">
                        {site.response_time_ms} ms
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-xs px-4 py-3 align-middle text-gray-600">
                    {site.status_reason || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 align-middle text-gray-600">
                    {formatDate(site.last_checked_at)}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        disabled={busyId === site.id}
                        defaultValue=""
                        onChange={(e) => {
                          const value = e.target.value as SiteStatus;
                          e.target.value = "";
                          if (value) void setManualStatus(site.id, value);
                        }}
                        className="h-8 border border-[var(--border)] bg-white px-2 text-xs"
                      >
                        <option value="" disabled>
                          Статус…
                        </option>
                        {(Object.keys(STATUS_LABELS) as SiteStatus[]).map(
                          (status) => (
                            <option key={status} value={status}>
                              {STATUS_LABELS[status]}
                            </option>
                          ),
                        )}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === site.id}
                        onClick={() => removeSite(site.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:opacity-50"
                      >
                        <TrashIcon />
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
