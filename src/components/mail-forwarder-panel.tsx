"use client";

import { Mail, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pagination, usePagedList } from "@/components/ui/pagination";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import { readJsonResponse } from "@/lib/fetch-json";
import type { CheckResult, MailboxView, PollTotals } from "@/lib/mail-forwarder/types";

type Status = {
  configured: boolean;
  error?: string;
  destinationEmail?: string;
  sendMethod?: string;
  sqlitePath: string;
  pollIntervalSeconds?: number;
  lastPollAt?: string | null;
  mailboxCount?: number;
  enabledCount?: number;
};

const TOKEN_TINT = {
  database: "bg-[#e8f8ee] text-[#248a3d]",
  environment: "bg-[#eaf3ff] text-[#0071e3]",
  missing: "bg-[#fff4e0] text-[#9a6700]",
} as const;

const emptyForm = {
  email: "",
  company: "",
  responsible: "",
  enabled: true,
  refreshTokenEnv: "ZOHO_REFRESH_TOKEN",
  refreshToken: "",
  accountId: "",
  zohoClientId: "",
  zohoClientSecret: "",
  zohoAccountsBaseUrl: "",
  zohoMailBaseUrl: "",
  clearStoredToken: false,
};

export function MailForwarderPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [mailboxes, setMailboxes] = useState<MailboxView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"poll" | "check" | "save" | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [editor, setEditor] = useState<"create" | MailboxView | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statusRes, boxesRes] = await Promise.all([
        fetch("/api/mail-forwarder/status", { cache: "no-store" }),
        fetch("/api/mail-forwarder/mailboxes", { cache: "no-store" }),
      ]);
      const statusData = await readJsonResponse<Status & { error?: string }>(statusRes);
      const boxesData = await readJsonResponse<{ mailboxes?: MailboxView[]; error?: string }>(boxesRes);
      if (!statusRes.ok) throw new Error(statusData.error || "Не удалось загрузить статус");
      if (!boxesRes.ok) throw new Error(boxesData.error || "Не удалось загрузить ящики");
      setStatus(statusData);
      setMailboxes(boxesData.mailboxes ?? []);
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

  const { page, setPage, totalPages, slice, total } = usePagedList(mailboxes, 8);

  async function runPoll() {
    setBusy("poll");
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/mail-forwarder/poll", { method: "POST" });
      const data = await readJsonResponse<PollTotals & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Не удалось проверить почту");
      setInfo(formatPollSummary(data));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  async function runCheck() {
    setBusy("check");
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/mail-forwarder/check", { method: "POST" });
      const data = await readJsonResponse<CheckResult & { error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Проверка не удалась");
      setCheckResult(data);
      setInfo(data.ok ? "Подключение к Zoho и отправителю в порядке." : "Есть ошибки подключения.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setEditor("create");
  }

  function openEdit(row: MailboxView) {
    setForm({
      ...emptyForm,
      email: row.email,
      company: row.company,
      responsible: row.responsible,
      enabled: row.enabled,
      refreshTokenEnv: row.refreshTokenEnv || "ZOHO_REFRESH_TOKEN",
      accountId: row.accountId,
      zohoAccountsBaseUrl: row.zohoAccountsBaseUrl,
      zohoMailBaseUrl: row.zohoMailBaseUrl,
    });
    setEditor(row);
  }

  async function saveMailbox(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError(null);
    setInfo(null);
    try {
      const creating = editor === "create";
      const response = await fetch("/api/mail-forwarder/mailboxes", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          company: form.company,
          responsible: form.responsible,
          enabled: form.enabled,
          refreshTokenEnv: form.refreshTokenEnv,
          refreshToken: form.refreshToken,
          clearStoredToken: form.clearStoredToken,
          accountId: form.accountId,
          zohoClientId: form.zohoClientId,
          zohoClientSecret: form.zohoClientSecret,
          zohoAccountsBaseUrl: form.zohoAccountsBaseUrl,
          zohoMailBaseUrl: form.zohoMailBaseUrl,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить");
      setEditor(null);
      setInfo(creating ? "Ящик добавлен. Следующая проверка подхватит его." : "Изменения сохранены.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  async function removeMailbox(email: string) {
    if (!window.confirm(`Удалить ящик ${email}? Уже пересланные письма останутся в истории.`)) return;
    setError(null);
    setInfo(null);
    try {
      const response = await fetch(`/api/mail-forwarder/mailboxes?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Не удалось удалить");
      setInfo("Ящик удалён.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Пересылка на legal" icon={<Mail size={16} />} />
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Каждую минуту сервер читает новые письма в подключённых Zoho-ящиках и пересылает их на{" "}
          <b>{status?.destinationEmail || "DESTINATION_EMAIL"}</b>
          {status?.sendMethod ? ` через ${status.sendMethod}` : ""}.
        </p>
        {!status?.configured && status?.error ? (
          <Alert className="mt-3">{status.error}. CRUD ящиков доступен, пересылка заработает после env.</Alert>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void runPoll()} disabled={busy != null}>
            {busy === "poll" ? "Проверяю…" : "Проверить и переслать сейчас"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void runCheck()} disabled={busy != null}>
            {busy === "check" ? "Проверяю доступ…" : "Проверить доступ"}
          </Button>
        </div>
      </Card>

      {info ? <Alert tone="ok">{info}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {checkResult ? (
        <Card>
          <CardHeader title="Результат проверки доступа" />
          {checkResult.sender ? (
            <p className="mb-2 text-sm">
              Отправитель ({checkResult.sender.sendMethod}): {checkResult.sender.ok ? "ок" : checkResult.sender.error}
            </p>
          ) : null}
          <ul className="space-y-1 text-sm">
            {checkResult.mailboxes.map((item) => (
              <li key={item.email}>
                <b>{item.email}</b>: {item.ok ? `ок, новых в окне ${item.unprocessedInLookback ?? 0}` : item.error}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card pad={false}>
        <div className="ui-card-pad pb-2 flex flex-wrap items-center justify-between gap-3">
          <CardHeader title={`Ящики (${mailboxes.length})`} icon={<Mail size={16} />} />
          <Button type="button" onClick={openCreate}>
            <Plus size={14} />
            Добавить ящик
          </Button>
        </div>
        {mailboxes.length === 0 ? (
          <EmptyState title="Пока пусто" hint="Добавьте Zoho-ящик, с которого письма должны уходить на legal." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-t border-[var(--border)] text-[11px] uppercase tracking-[0.06em] text-[var(--muted)]">
                  <th className="px-5 py-3">Ящик</th>
                  <th className="px-5 py-3">Статус</th>
                  <th className="px-5 py-3">Ответственный</th>
                  <th className="px-5 py-3">Токен</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {slice.map((row) => (
                  <tr key={row.email} className="border-t border-[var(--border)]">
                    <td className="px-5 py-3">
                      <div className="font-medium text-[var(--text)]">{row.company}</div>
                      <div className="text-xs text-[var(--muted)]">{row.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`ui-chip ${row.enabled ? "bg-[#e8f8ee] text-[#248a3d]" : "bg-[#f2f2f7] text-[#6e6e73]"}`}>
                        {row.enabled ? "Включён" : "Выключен"}
                      </span>
                    </td>
                    <td className="px-5 py-3">{row.responsible}</td>
                    <td className="px-5 py-3">
                      <span className={`ui-chip ${TOKEN_TINT[row.tokenSource]}`}>
                        {row.tokenSource === "database" ? "В базе" : row.tokenSource === "environment" ? "Env" : "Нет токена"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => openEdit(row)}>
                          Изменить
                        </Button>
                        <Button type="button" variant="danger" onClick={() => void removeMailbox(row.email)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
          </div>
        )}
      </Card>

      {editor ? (
        <Modal className="max-w-lg" onClose={() => setEditor(null)}>
          <form onSubmit={(event) => void saveMailbox(event)} className="max-h-[80vh] space-y-3 overflow-y-auto">
            <h2 className="text-[16px] font-semibold">{editor === "create" ? "Добавить ящик" : "Изменить ящик"}</h2>
            <Field label="Email">
              <Input
                required
                type="email"
                value={form.email}
                readOnly={editor !== "create"}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Компания">
              <Input required value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} />
            </Field>
            <Field label="Ответственный">
              <Input
                required
                value={form.responsible}
                onChange={(event) => setForm((current) => ({ ...current, responsible: event.target.value }))}
              />
            </Field>
            <Field label="Zoho client ID">
              <Input value={form.zohoClientId} onChange={(event) => setForm((current) => ({ ...current, zohoClientId: event.target.value }))} />
            </Field>
            <Field label="Zoho client secret">
              <Input
                type="password"
                autoComplete="off"
                placeholder="Пустое поле не меняет секрет"
                value={form.zohoClientSecret}
                onChange={(event) => setForm((current) => ({ ...current, zohoClientSecret: event.target.value }))}
              />
            </Field>
            <Field label="Refresh token">
              <Input
                type="password"
                autoComplete="off"
                placeholder="Пустое поле не меняет токен"
                value={form.refreshToken}
                onChange={(event) => setForm((current) => ({ ...current, refreshToken: event.target.value }))}
              />
            </Field>
            <Field label="Zoho accounts URL">
              <Input
                value={form.zohoAccountsBaseUrl}
                onChange={(event) => setForm((current) => ({ ...current, zohoAccountsBaseUrl: event.target.value }))}
              />
            </Field>
            <Field label="Zoho mail URL">
              <Input
                value={form.zohoMailBaseUrl}
                onChange={(event) => setForm((current) => ({ ...current, zohoMailBaseUrl: event.target.value }))}
              />
            </Field>
            <Field label="Zoho account id">
              <Input value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
              Включён
            </label>
            {editor !== "create" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.clearStoredToken}
                  onChange={(event) => setForm((current) => ({ ...current, clearStoredToken: event.target.checked }))}
                />
                Удалить Zoho-секреты из базы
              </label>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditor(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy === "save"}>
                {busy === "save" ? "Сохраняю…" : editor === "create" ? "Добавить" : "Сохранить"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function MailPollTimer() {
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/mail-forwarder/status", { cache: "no-store" });
      const data = await readJsonResponse<Status & { error?: string }>(response);
      if (!response.ok) return;
      setLastPollAt(data.lastPollAt ?? null);
      if (data.pollIntervalSeconds) setIntervalSeconds(data.pollIntervalSeconds);
    } catch {
      // Keep the last known timestamp if status briefly fails.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => {
      void refresh();
    }, 5_000);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

  if (!lastPollAt) {
    return (
      <span className="whitespace-nowrap text-[12px] text-[var(--muted)]">Почта ещё не проверялась</span>
    );
  }

  const nextAt = new Date(lastPollAt).getTime() + intervalSeconds * 1000;
  const remaining = nextAt - now;
  const nextLabel = remaining > 0 ? `Следующее через ${formatCountdown(remaining)}` : "Следующее сейчас";

  return <span className="whitespace-nowrap tabular-nums text-[12px] text-[var(--muted)]">{nextLabel}</span>;
}

function formatPollSummary(data: PollTotals): string {
  const summary = `Проверка завершена: ящиков ${data.mailboxes}, переслано ${data.forwarded}, ошибок ${data.failed}.`;
  const forwarded = (data.byMailbox ?? []).filter((item) => item.forwarded > 0);
  if (!forwarded.length) return summary;
  const details = forwarded.map((item) => `${item.email} — ${item.forwarded}`).join(", ");
  return `${summary} С ящиков: ${details}.`;
}
