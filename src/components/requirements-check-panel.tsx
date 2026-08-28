"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RequirementCheckSession,
  RequirementResultRow,
  RequirementResultStatus,
  ScanEvent,
} from "@/lib/requirements-check/types";

const STATUS_DOT: Record<RequirementResultStatus, string> = {
  PASS: "bg-green-500",
  MANUAL: "bg-yellow-400",
  FAIL: "bg-red-500",
};

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const sec = Math.round(ms / 1000);
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return `${min}:${rest.toString().padStart(2, "0")}`;
}

export function RequirementsCheckPanel() {
  const [sessions, setSessions] = useState<RequirementCheckSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<RequirementCheckSession | null>(null);
  const [results, setResults] = useState<RequirementResultRow[]>([]);
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RequirementResultStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginPageUrl, setLoginPageUrl] = useState("");

  const loadSessions = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/requirements-check");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить");
      setSessions(data.sessions as RequirementCheckSession[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScan = useCallback(async (id: string) => {
    const response = await fetch(`/api/requirements-check/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось загрузить скан");
    setActiveSession(data.session as RequirementCheckSession);
    setResults(data.results as RequirementResultRow[]);
    setEvents(data.events as ScanEvent[]);
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!activeId) return;
    void loadScan(activeId).catch((err) =>
      setError(err instanceof Error ? err.message : "Ошибка"),
    );

    const source = new EventSource(`/api/requirements-check/${activeId}/events`);
    source.addEventListener("event", (message) => {
      const event = JSON.parse(message.data) as ScanEvent;
      setEvents((prev) => [...prev, event]);
      void loadScan(activeId);
      void loadSessions();
    });
    source.addEventListener("screenshot", (message) => {
      const payload = JSON.parse(message.data) as { dataUrl: string };
      setLiveScreenshot(payload.dataUrl);
    });

    return () => source.close();
  }, [activeId, loadScan, loadSessions]);

  async function startScan() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/requirements-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl,
          login: login || undefined,
          password: password || undefined,
          loginPageUrl: loginPageUrl || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось запустить проверку");
      setActiveId(String(data.session.id));
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteScan(id: string) {
    if (!window.confirm("Delete this audit from history? This cannot be undone.")) return;
    setError(null);
    try {
      const response = await fetch(`/api/requirements-check/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete audit");
      if (activeId === id) {
        setActiveId(null);
        setActiveSession(null);
        setResults([]);
        setEvents([]);
        setLiveScreenshot(null);
      }
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function cancelScan() {
    if (!activeId) return;
    await fetch(`/api/requirements-check/${activeId}/cancel`, { method: "POST" });
    await loadScan(activeId);
  }

  async function resumeScan() {
    if (!activeId) return;
    await fetch(`/api/requirements-check/${activeId}/resume`, { method: "POST" });
    await loadScan(activeId);
  }

  const categories = useMemo(
    () => [...new Set(results.map((item) => item.requirement_category))],
    [results],
  );

  const visibleResults = useMemo(() => {
    return results.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (categoryFilter !== "all" && item.requirement_category !== categoryFilter) return false;
      return true;
    });
  }, [results, filter, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, RequirementResultRow[]>();
    for (const row of visibleResults) {
      const key = `${row.requirement_category}::${row.requirement_sub_category}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [...map.entries()];
  }, [visibleResults]);

  return (
    <div className="space-y-6">
      <section className="rounded border border-[var(--border)] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Requirements Check</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Website URL</span>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Login page URL (optional)</span>
            <input
              value={loginPageUrl}
              onChange={(e) => setLoginPageUrl(e.target.value)}
              placeholder="https://example.com/login"
              className="w-full border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Login / Email (optional)</span>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Password (optional)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={submitting || !websiteUrl.trim()}
            onClick={() => void startScan()}
            className="h-8 bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {submitting ? "Запуск…" : "Check website"}
          </button>
          {activeId && activeSession && !["completed", "failed", "cancelled"].includes(activeSession.status) ? (
            <>
              <button type="button" onClick={() => void cancelScan()} className="h-8 border px-3 text-sm">
                Cancel check
              </button>
              {activeSession.status === "paused_for_user" ? (
                <button type="button" onClick={() => void resumeScan()} className="h-8 border px-3 text-sm">
                  Continue
                </button>
              ) : null}
            </>
          ) : null}
          {activeId ? (
            <a
              href={`/api/requirements-check/${activeId}/pdf`}
              className="inline-flex h-8 items-center border px-3 text-sm hover:bg-gray-50"
            >
              Download PDF
            </a>
          ) : null}
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {activeSession ? (
        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded border border-[var(--border)] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{activeSession.hostname}</div>
                <div className="text-xs text-gray-500">{activeSession.website_url}</div>
              </div>
              <div className="text-right text-xs text-gray-600">
                <div>Status: {activeSession.status}</div>
                <div>Progress: {activeSession.progress_percent}%</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <Metric label="Overall Score" value={`${activeSession.overall_score ?? 0}%`} />
              <Metric label="Automation" value={`${activeSession.automation_coverage ?? 0}%`} />
              <Metric label="Pages" value={`${activeSession.checked_pages}/${activeSession.discovered_pages}`} />
              <Metric label="Duration" value={formatDuration(activeSession.duration_ms)} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <Metric label="PASS" value={String(activeSession.passed_requirements)} />
              <Metric label="MANUAL" value={String(activeSession.manual_requirements)} />
              <Metric label="FAIL" value={String(activeSession.failed_requirements)} />
            </div>
            {activeSession.current_page ? (
              <p className="mt-3 text-xs text-gray-600">
                Current page: {activeSession.current_page}
                {activeSession.current_action ? ` · ${activeSession.current_action}` : ""}
              </p>
            ) : null}
            {activeSession.pause_reason ? (
              <p className="mt-2 text-sm text-yellow-700">{activeSession.pause_reason}</p>
            ) : null}
          </div>

          <div className="rounded border border-[var(--border)] bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold">Live Browser</h3>
            {liveScreenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={liveScreenshot} alt="Live browser" className="max-h-72 w-full border object-contain" />
            ) : (
              <div className="flex h-48 items-center justify-center border text-xs text-gray-500">
                Waiting for browser stream…
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeSession ? (
        <section className="rounded border border-[var(--border)] bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {(["all", "PASS", "MANUAL", "FAIL"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded px-2 py-1 ${filter === id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
              >
                {id === "all" ? "All" : id === "MANUAL" ? "Manual Review" : id}
              </button>
            ))}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded border px-2 py-1"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            {grouped.map(([key, rows]) => {
              const [category, subCategory] = key.split("::");
              const passCount = rows.filter((r) => r.status === "PASS").length;
              const sectionScore = rows.length ? Math.round((passCount / rows.length) * 100) : 0;
              return (
                <div key={key}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase text-gray-700">
                      {category} / {subCategory}
                    </h3>
                    <span className="text-xs text-gray-500">{sectionScore}%</span>
                  </div>
                  <div className="divide-y border border-[var(--border)]">
                    {rows.map((row) => (
                      <div key={row.id} className="bg-white px-3 py-2">
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 text-left"
                          onClick={() =>
                            setExpandedId((prev) => (prev === row.id ? null : row.id))
                          }
                        >
                          <span className={`mt-1 h-2.5 w-2.5 rounded-full ${STATUS_DOT[row.status]}`} />
                          <span className="flex-1 text-sm">{row.requirement_name}</span>
                          <span className="text-xs text-gray-500">{row.status}</span>
                        </button>
                        {expandedId === row.id ? (
                          <div className="mt-2 space-y-1 pl-5 text-xs text-gray-600">
                            <p>{row.explanation}</p>
                            {(row.checked_url || row.checkedUrl) ? (
                              <p>Checked URL: {row.checked_url || row.checkedUrl}</p>
                            ) : null}
                            {row.evidence?.manualInstruction ? (
                              <p>Manual: {row.evidence.manualInstruction}</p>
                            ) : null}
                            {row.evidence?.textSnippet ? (
                              <p className="line-clamp-3">{row.evidence.textSnippet}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded border border-[var(--border)] bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Audit history</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Загрузка…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-500">No scans yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-[var(--border)] px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{session.hostname}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(session.created_at).toLocaleString()} · {session.status}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{session.overall_score ?? "—"}%</span>
                  <button
                    type="button"
                    className="text-xs text-gray-700 hover:underline"
                    onClick={() => setActiveId(session.id)}
                  >
                    View report
                  </button>
                  <a
                    href={`/api/requirements-check/${session.id}/pdf`}
                    className="text-xs text-gray-700 hover:underline"
                  >
                    PDF
                  </a>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => void deleteScan(session.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {activeSession && events.length > 0 ? (
        <section className="rounded border border-[var(--border)] bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">Activity log</h3>
          <div className="max-h-48 overflow-y-auto text-xs text-gray-600">
            {events.slice(-40).map((event) => (
              <div key={event.id || `${event.created_at}-${event.message}`}>
                {new Date(event.created_at).toLocaleTimeString()} · {event.message}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--border)] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}
