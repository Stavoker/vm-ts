"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddSiteForm } from "@/components/add-site-form";
import { Sidebar, type NavView } from "@/components/sidebar";
import { SitesTable } from "@/components/sites-table";
import { PaymentsPanel } from "@/components/payments-panel";
import { RequirementsCheckPanel } from "@/components/requirements-check-panel";
import { TelegramPanel } from "@/components/telegram-panel";
import { CHECK_INTERVAL_MS } from "@/lib/constants";
import type { Site, SiteStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

const STATUS_SET = new Set<SiteStatus>([
  "online",
  "offline",
  "payment_required",
  "blocked",
  "error",
]);

function isStatusView(view: NavView): view is SiteStatus {
  return STATUS_SET.has(view as SiteStatus);
}

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function Dashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckAt, setLastCheckAt] = useState<number | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState(
    () => Date.now() + CHECK_INTERVAL_MS,
  );
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<NavView>("sites");
  const [mobileOpen, setMobileOpen] = useState(false);
  const checkingRef = useRef(false);

  const refreshSites = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/sites");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить");
      setSites(data.sites as Site[]);
      setNextRefreshAt(Date.now() + CHECK_INTERVAL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAll = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setError(null);

    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Проверка не удалась");
      setLastCheckAt(Date.now());
      await refreshSites();
      console.log("[ui] manual check:", data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка проверки");
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [refreshSites]);

  useEffect(() => {
    void refreshSites();
  }, [refreshSites]);

  useEffect(() => {
    const startup = setTimeout(() => {
      void refreshSites();
    }, 1500);

    const interval = setInterval(() => {
      void refreshSites();
    }, CHECK_INTERVAL_MS);

    const clock = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearTimeout(startup);
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [refreshSites]);

  const counts = useMemo(() => {
    const next = {
      all: sites.length,
      online: 0,
      offline: 0,
      payment_required: 0,
      blocked: 0,
      error: 0,
    } as Record<"all" | SiteStatus, number> & { all: number };

    for (const site of sites) {
      next[site.status] += 1;
    }
    return next;
  }, [sites]);

  const visibleSites = useMemo(() => {
    if (view === "sites" || view === "add" || view === "telegram" || view === "payments" || view === "requirements") {
      return sites;
    }
    return sites.filter((site) => site.status === view);
  }, [sites, view]);

  const title =
    view === "add"
      ? "Добавить сайт"
      : view === "telegram"
        ? "Telegram"
        : view === "payments"
          ? "Оплаты Notion"
          : view === "requirements"
            ? "Requirements Check"
            : view === "sites"
            ? "Все сайты"
            : STATUS_LABELS[view];

  const countdown = formatCountdown(nextRefreshAt - now);
  const lastCheckLabel = lastCheckAt
    ? new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(lastCheckAt))
    : null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        view={view}
        onNavigate={setView}
        counts={counts}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        nextRefreshLabel={checking ? "сейчас…" : countdown}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:ml-64">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-sm text-gray-700 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              Меню
            </button>
            <h1 className="text-base font-semibold text-gray-900">{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-gray-500 sm:inline">
              {checking
                ? "Идёт проверка…"
                : lastCheckLabel
                  ? `Последняя проверка: ${lastCheckLabel} · обновление через ${countdown}`
                  : `Обновление данных через ${countdown}`}
            </span>
            {view !== "add" && view !== "telegram" && view !== "payments" && view !== "requirements" ? (
              <button
                type="button"
                onClick={() => void checkAll()}
                disabled={checking || loading}
                className="h-8 bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              >
                {checking ? "Проверяю…" : "Проверить сейчас"}
              </button>
            ) : null}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)] p-4 lg:p-6">
          {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

          {view === "add" ? (
            <AddSiteForm
              onCreated={() => {
                void refreshSites();
                setView("sites");
              }}
            />
          ) : view === "telegram" ? (
            <TelegramPanel />
          ) : view === "payments" ? (
            <PaymentsPanel />
          ) : view === "requirements" ? (
            <RequirementsCheckPanel />
          ) : loading ? (
            <p className="text-sm text-gray-500">Загрузка…</p>
          ) : (
            <SitesTable sites={visibleSites} onChanged={() => void refreshSites()} />
          )}

          {!loading &&
          view !== "add" &&
          view !== "telegram" &&
          view !== "payments" &&
          view !== "requirements" &&
          isStatusView(view) ? (
            <p className="mt-3 text-xs text-gray-500">
              Показано {visibleSites.length} из {sites.length}
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
