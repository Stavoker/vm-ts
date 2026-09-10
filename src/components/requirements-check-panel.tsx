"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input, LoadingState, Select } from "@/components/ui/primitives";
import { Pagination, usePagedList } from "@/components/ui/pagination";
import { readJsonResponse } from "@/lib/fetch-json";
import type {
  RequirementCheckSession,
  RequirementResultRow,
  RequirementResultStatus,
  ScanEvent,
} from "@/lib/requirements-check/types";

const SCAN_REFRESH_DEBOUNCE_MS = 2_500;
const SESSIONS_REFRESH_DEBOUNCE_MS = 30_000;
const IMMEDIATE_REFRESH_EVENTS = new Set([
  "scan_completed",
  "scan_failed",
  "error",
  "scan_paused",
  "requirement_completed",
  "discovery_completed",
  "browser_exploration_completed",
  "ai_review_completed",
]);

const STATUS_DOT: Record<RequirementResultStatus, string> = {
  PASS: "bg-green-500",
  MANUAL: "bg-yellow-400",
  FAIL: "bg-red-500",
};

const ACTIVITY_EVENT_STYLE: Record<string, string> = {
  button_clicked: "text-violet-700",
  menu_item_clicked: "text-violet-600",
  page_navigated: "text-blue-700",
  page_returned: "text-blue-500",
  url_discovered: "text-cyan-700",
  navigation_discovered: "text-cyan-600",
  page_opened: "text-indigo-700",
  page_scroll: "text-gray-500",
  page_explored: "text-emerald-700",
  login_step: "text-amber-700",
  login_successful: "text-green-700",
  login_failed: "text-red-600",
  requirement_started: "text-gray-700",
  requirement_completed: "text-gray-600",
  error: "text-red-700",
};

function activityEventLabel(eventType: string): string {
  return eventType.replace(/_/g, " ");
}

function scanEventKey(event: ScanEvent): string {
  return event.id || `${event.created_at}|${event.event_type}|${event.message}`;
}

function dedupeScanEvents(events: ScanEvent[]): ScanEvent[] {
  const seen = new Set<string>();
  const unique: ScanEvent[] = [];
  for (const event of events) {
    const key = scanEventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique;
}

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
  const scanRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadScanInFlightRef = useRef(false);

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginPageUrl, setLoginPageUrl] = useState("");

  const loadSessions = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setError(null);
    try {
      const response = await fetch("/api/requirements-check");
      const data = await readJsonResponse<{ sessions: RequirementCheckSession[]; error?: string }>(
        response,
      );
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить");
      setSessions(data.sessions);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка";
      if (options?.silent) {
        console.warn("[requirements-check] sessions refresh failed:", message);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScan = useCallback(async (id: string, options?: { includeEvents?: boolean; lite?: boolean }) => {
    if (loadScanInFlightRef.current) return;
    loadScanInFlightRef.current = true;
    try {
      const query = options?.lite ? "?lite=1" : "";
      const response = await fetch(`/api/requirements-check/${id}${query}`);
      const data = await readJsonResponse<{
        session: RequirementCheckSession;
        results: RequirementResultRow[];
        events: ScanEvent[];
        error?: string;
      }>(response);
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить скан");
      setActiveSession(data.session);
      setResults(data.results);
      if (options?.includeEvents !== false && data.events.length > 0) {
        setEvents(dedupeScanEvents(data.events));
      }
    } finally {
      loadScanInFlightRef.current = false;
    }
  }, []);

  const scheduleScanRefresh = useCallback(
    (id: string, immediate = false) => {
      if (scanRefreshTimerRef.current) {
        clearTimeout(scanRefreshTimerRef.current);
        scanRefreshTimerRef.current = null;
      }

      const run = () => {
        void loadScan(id, { includeEvents: false, lite: true }).catch((err) => {
          console.warn("[requirements-check] scan refresh failed:", err);
        });
      };

      if (immediate) {
        run();
        return;
      }

      scanRefreshTimerRef.current = setTimeout(run, SCAN_REFRESH_DEBOUNCE_MS);
    },
    [loadScan],
  );

  const scheduleSessionsRefresh = useCallback(() => {
    if (sessionsRefreshTimerRef.current) return;
    sessionsRefreshTimerRef.current = setTimeout(() => {
      sessionsRefreshTimerRef.current = null;
      void loadSessions({ silent: true });
    }, SESSIONS_REFRESH_DEBOUNCE_MS);
  }, [loadSessions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSessions();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadSessions]);

  useEffect(() => {
    if (!activeId) return;
    void loadScan(activeId).catch((err) => {
      console.warn("[requirements-check] initial scan load failed:", err);
    });

    const source = new EventSource(`/api/requirements-check/${activeId}/events`);
    source.addEventListener("event", (message) => {
      try {
        const event = JSON.parse(message.data) as ScanEvent;
        setEvents((prev) => dedupeScanEvents([...prev, event]));
        scheduleScanRefresh(activeId, IMMEDIATE_REFRESH_EVENTS.has(event.event_type));
        if (IMMEDIATE_REFRESH_EVENTS.has(event.event_type)) {
          void loadSessions({ silent: true });
        } else {
          scheduleSessionsRefresh();
        }
      } catch (err) {
        console.warn("[requirements-check] malformed SSE event:", err);
      }
    });
    source.addEventListener("screenshot", (message) => {
      try {
        const payload = JSON.parse(message.data) as { dataUrl: string };
        setLiveScreenshot(payload.dataUrl);
      } catch (err) {
        console.warn("[requirements-check] malformed SSE screenshot:", err);
      }
    });
    source.onerror = () => {
      console.warn("[requirements-check] SSE connection interrupted, will retry automatically");
    };

    return () => {
      source.close();
      if (scanRefreshTimerRef.current) clearTimeout(scanRefreshTimerRef.current);
      if (sessionsRefreshTimerRef.current) clearTimeout(sessionsRefreshTimerRef.current);
    };
  }, [activeId, loadScan, loadSessions, scheduleScanRefresh, scheduleSessionsRefresh]);

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
      const data = await readJsonResponse<{ session: RequirementCheckSession; error?: string }>(
        response,
      );
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
      const data = await readJsonResponse<{ ok?: boolean; error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Delete failed");
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

  const {
    page: historyPage,
    setPage: setHistoryPage,
    totalPages: historyPages,
    slice: historySlice,
    total: historyTotal,
  } = usePagedList(sessions);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Requirements Check" />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Website URL">
            <Input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </Field>
          <Field label="Login page URL (optional)">
            <Input
              value={loginPageUrl}
              onChange={(e) => setLoginPageUrl(e.target.value)}
              placeholder="https://example.com/login"
            />
          </Field>
          <Field label="Login / Email (optional)">
            <Input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </Field>
          <Field label="Password (optional)">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={submitting || !websiteUrl.trim()}
            onClick={() => void startScan()}
          >
            {submitting ? "Запуск…" : "Check website"}
          </Button>
          {activeId && activeSession && !["completed", "failed", "cancelled"].includes(activeSession.status) ? (
            <>
              <Button type="button" variant="secondary" onClick={() => void cancelScan()}>
                Cancel check
              </Button>
              {activeSession.status === "paused_for_user" ? (
                <Button type="button" variant="secondary" onClick={() => void resumeScan()}>
                  Continue
                </Button>
              ) : null}
            </>
          ) : null}
          {activeId ? (
            <a
              href={`/api/requirements-check/${activeId}/pdf`}
              className="ui-btn ui-btn-secondary"
            >
              Download PDF
            </a>
          ) : null}
        </div>
      </Card>

      {error ? <Alert>{error}</Alert> : null}

      {activeSession ? (
        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[15px] font-semibold tracking-tight">{activeSession.hostname}</div>
                <div className="text-xs text-[var(--muted)]">{activeSession.website_url}</div>
              </div>
              <div className="text-right text-xs text-[var(--muted)]">
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
              <p className="mt-3 text-xs text-[var(--muted)]">
                Current page: {activeSession.current_page}
                {activeSession.current_action ? ` · ${activeSession.current_action}` : ""}
              </p>
            ) : null}
            {activeSession.pause_reason ? (
              <Alert tone="warn" className="mt-3">{activeSession.pause_reason}</Alert>
            ) : null}
          </Card>

          <Card>
            <h3 className="mb-3 text-[15px] font-semibold tracking-tight">Live Browser</h3>
            {liveScreenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={liveScreenshot} alt="Live browser" className="max-h-72 w-full rounded-[14px] border border-[var(--border)] object-contain" />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] text-xs text-[var(--muted)]">
                Waiting for browser stream…
              </div>
            )}
          </Card>
        </section>
      ) : null}

      {activeSession ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="ui-seg">
              {(["all", "PASS", "MANUAL", "FAIL"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  data-active={filter === id}
                  className="ui-seg-btn"
                >
                  {id === "all" ? "All" : id === "MANUAL" ? "Manual Review" : id}
                </button>
              ))}
            </div>
            <div className="w-[220px]">
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            {grouped.map(([key, rows]) => {
              const [category, subCategory] = key.split("::");
              const passCount = rows.filter((r) => r.status === "PASS").length;
              const sectionScore = rows.length ? Math.round((passCount / rows.length) * 100) : 0;
              return (
                <div key={key}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">
                      {category} / {subCategory}
                    </h3>
                    <span className="text-xs text-[var(--muted)]">{sectionScore}%</span>
                  </div>
                  <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
                    {rows.map((row) => (
                      <div key={row.id} className="border-t border-[var(--border)] bg-white px-4 py-3 first:border-0">
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 text-left"
                          onClick={() =>
                            setExpandedId((prev) => (prev === row.id ? null : row.id))
                          }
                        >
                          <span className={`mt-1 h-2.5 w-2.5 rounded-full ${STATUS_DOT[row.status]}`} />
                          <span className="flex-1 text-sm">{row.requirement_name}</span>
                          <span className="text-xs text-[var(--muted)]">{row.status}</span>
                        </button>
                        {row.explanation ? (
                          <p className="mt-1 line-clamp-3 pl-5 text-xs text-[var(--muted)]">{row.explanation}</p>
                        ) : null}
                        {expandedId === row.id ? (
                          <div className="mt-2 space-y-1 pl-5 text-xs text-[var(--muted)]">
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
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Audit history" />
        {loading ? (
          <LoadingState />
        ) : sessions.length === 0 ? (
          <EmptyState title="No scans yet." hint="Start a check to see audit history here." />
        ) : (
          <div className="space-y-2">
            {historySlice.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">{session.hostname}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {new Date(session.created_at).toLocaleString()} · {session.status}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{session.overall_score ?? "—"}%</span>
                  <Button type="button" variant="ghost" onClick={() => setActiveId(session.id)}>
                    View report
                  </Button>
                  <a
                    href={`/api/requirements-check/${session.id}/pdf`}
                    className="ui-btn ui-btn-ghost"
                  >
                    PDF
                  </a>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => void deleteScan(session.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Pagination page={historyPage} totalPages={historyPages} total={historyTotal} onPage={setHistoryPage} />
      </Card>

      {activeSession && events.length > 0 ? (
        <Card>
          <CardHeader title="Activity log" />
          <div className="max-h-72 overflow-y-auto rounded-[14px] bg-[var(--surface-muted)] px-4 py-2 font-mono text-[11px] leading-5 text-[var(--muted)]">
            {events.slice(-120).map((event, index) => (
              <div
                key={`${scanEventKey(event)}-${index}`}
                className="border-b border-[var(--border)] py-1.5 last:border-0"
              >
                <span className="text-[var(--muted)]">{new Date(event.created_at).toLocaleTimeString()}</span>
                {" · "}
                <span className="uppercase tracking-wide text-[10px] text-[var(--muted)]">
                  {activityEventLabel(event.event_type)}
                </span>
                {" · "}
                <span className={ACTIVITY_EVENT_STYLE[event.event_type] || "text-[var(--text)]"}>
                  {event.message}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">{label}</div>
      <div className="text-sm font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}
