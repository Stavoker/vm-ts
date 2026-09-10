"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { daysUntil } from "@/lib/reminders-client";
import type { PaymentReminder, ReminderKind, ReminderStatus } from "@/lib/reminder-types";
import { Pagination, usePagedList } from "@/components/ui/pagination";
import { Alert, Button, EmptyState, LoadingState } from "@/components/ui/primitives";

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

const KIND_LABEL: Record<ReminderKind, string> = {
  domain: "Домен",
  phone: "Телефон",
  service: "Сервис",
};

const STATUS_CHIP = {
  pending: "bg-[#fff4e0] text-[#9a6700]",
  later: "bg-[#eaf3ff] text-[#0071e3]",
  payed: "bg-[#e8f8ee] text-[#248a3d]",
  ok: "bg-[#e8f8ee] text-[#248a3d]",
  none: "bg-[#f2f2f7] text-[#6e6e73]",
} as const;

function displayStatus(item: PaymentReminder): { label: string; className: string } {
  if (item.status === "payed") return { label: "Payed", className: STATUS_CHIP.payed };
  if (item.status === "later") return { label: "Later", className: STATUS_CHIP.later };

  const left = daysUntil(item.due_date);
  if (left == null) return { label: "Нет даты", className: STATUS_CHIP.none };
  if (left > 7) return { label: "Payed", className: STATUS_CHIP.ok };
  return { label: "Ожидает", className: STATUS_CHIP.pending };
}

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
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
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
    return reminders.filter((item) => item.kind === filter || item.status === filter);
  }, [reminders, filter]);
  const { page, setPage, totalPages, slice, total } = usePagedList(visible);

  useEffect(() => {
    setPage(0);
  }, [filter, setPage]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          Напоминания из Notion за 7 дней до даты в колонке «Істекає». Подгружаются все строки, даже без даты. Later —
          каждый день, Payed — стоп до новой даты в Notion.
        </p>
        <Button type="button" onClick={() => void runNow()} disabled={running}>
          {running ? "Проверяю…" : "Проверить Notion"}
        </Button>
      </div>

      <div className="ui-seg">
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
            data-active={filter === id}
            className="ui-seg-btn"
          >
            {label}
          </button>
        ))}
      </div>

      {info ? <Alert tone="ok">{info}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="ui-table-wrap">
          {visible.length === 0 ? (
            <EmptyState
              title="Нет записей"
              hint="Нажмите «Проверить Notion» после SQL-миграции."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Компания</th>
                    <th>Что</th>
                    <th>Оплатить</th>
                    <th>До</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((item) => {
                    const left = daysUntil(item.due_date);
                    const status = displayStatus(item);
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="font-medium">{item.company}</div>
                          <div className="text-xs text-[var(--muted)]">{KIND_LABEL[item.kind]}</div>
                        </td>
                        <td>{item.target || "—"}</td>
                        <td>{item.pay_for || "—"}</td>
                        <td className="whitespace-nowrap">
                          {item.due_date ? formatDate(item.due_date) : "—"}
                          <div className="text-xs text-[var(--muted)]">
                            {left == null
                              ? "нет даты в Notion"
                              : left > 0
                                ? `${left} дн.`
                                : left === 0
                                  ? "сегодня"
                                  : `просрочено ${Math.abs(left)}`}
                          </div>
                        </td>
                        <td>
                          <span className={`ui-chip ${status.className}`}>{status.label}</span>
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <Button type="button" variant="secondary" onClick={() => void setStatus(item.id, "later")}>
                              Later
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => void setStatus(item.id, "payed")}>
                              Payed
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
