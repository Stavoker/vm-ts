"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { daysUntil } from "@/lib/reminders-client";
import type { PaymentReminder, ReminderKind, ReminderStatus } from "@/lib/reminder-types";

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

const STATUS_LABEL: Record<ReminderStatus, string> = {
  pending: "Ожидает",
  later: "Later",
  payed: "Payed",
};

const KIND_LABEL: Record<ReminderKind, string> = {
  domain: "Домен",
  phone: "Телефон",
  service: "Сервис",
};

export function PaymentsPanel() {
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [filter, setFilter] = useState<"all" | ReminderKind | ReminderStatus>("all");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/reminders");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить");
      setReminders(data.reminders as PaymentReminder[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runNow() {
    setRunning(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/reminders", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось проверить");
      setInfo(`Синхронизировано ${data.synced}, отправлено ${data.notified}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setRunning(false);
    }
  }

  async function setStatus(id: string, status: ReminderStatus) {
    setError(null);
    try {
      const response = await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось обновить");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  const visible = useMemo(() => {
    if (filter === "all") return reminders;
    return reminders.filter(
      (item) => item.kind === filter || item.status === filter,
    );
  }, [reminders, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-600">
          Напоминания из Notion за 7 дней до даты в колонке «Істекає». Подгружаются
          все строки, даже без даты. Later — каждый день, Payed — стоп до новой
          даты в Notion.
        </p>
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={running}
          className="h-8 bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {running ? "Проверяю…" : "Проверить Notion"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ["all", "Все"],
            ["domain", "Домены"],
            ["phone", "Телефоны"],
            ["service", "Сервисы"],
            ["later", "Later"],
            ["payed", "Payed"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded px-2 py-1 ${
              filter === id
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {info ? <p className="text-sm text-green-700">{info}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--border)] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Компания</th>
                <th className="px-4 py-3">Что</th>
                <th className="px-4 py-3">Оплатить</th>
                <th className="px-4 py-3">До</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    Нет записей. Нажмите «Проверить Notion» после SQL-миграции.
                  </td>
                </tr>
              ) : (
                visible.map((item) => {
                  const left = daysUntil(item.due_date);
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{item.company}</div>
                        <div className="text-xs text-gray-500">
                          {KIND_LABEL[item.kind]}
                        </div>
                      </td>
                      <td className="px-4 py-3">{item.target || "—"}</td>
                      <td className="px-4 py-3">{item.pay_for || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.due_date ? formatDate(item.due_date) : "—"}
                        <div className="text-xs text-gray-500">
                          {left == null
                            ? "нет даты в Notion"
                            : left > 0
                              ? `${left} дн.`
                              : left === 0
                                ? "сегодня"
                                : `просрочено ${Math.abs(left)}`}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {STATUS_LABEL[item.status]}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void setStatus(item.id, "later")}
                            className="text-xs text-gray-700 hover:underline"
                          >
                            Later
                          </button>
                          <button
                            type="button"
                            onClick={() => void setStatus(item.id, "payed")}
                            className="text-xs text-green-700 hover:underline"
                          >
                            Payed
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
