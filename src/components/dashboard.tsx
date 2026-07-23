"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddSiteForm } from "@/components/add-site-form";
import { Sidebar, type NavView } from "@/components/sidebar";
import { SitesTable } from "@/components/sites-table";
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
  const [nextCheckAt, setNextCheckAt] = useState(
    () => Date.now() + CHECK_INTERVAL_MS,
  );
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<NavView>("sites");
  const [mobileOpen, setMobileOpen] = useState(false);
  const checkingRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/sites");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить");
      setSites(data.sites as Site[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAll = useCallback(
    async (reason: "manual" | "timer" | "startup") => {
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
        setNextCheckAt(Date.now() + CHECK_INTERVAL_MS);
        await load();
        console.log(`[ui] check (${reason}):`, data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка проверки");
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const startup = setTimeout(() => {
      void checkAll("startup");
    }, 1500);

    const interval = setInterval(() => {
      void checkAll("timer");
    }, CHECK_INTERVAL_MS);

    const clock = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearTimeout(startup);
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [checkAll]);

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
    if (view === "sites" || view === "add") return sites;
    return sites.filter((site) => site.status === view);
  }, [sites, view]);

  const title =
    view === "add"
      ? "Добавить сайт"
      : view === "telegram"
        ? "Telegram"
        : view === "sites"
          ? "Все сайты"
          : STATUS_LABELS[view];

  const countdown = formatCountdown(nextCheckAt - now);
  const lastCheckLabel = lastCheckAt
    ? new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(lastCheckAt))
    : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        view={view}
        onNavigate={setView}
        counts={counts}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        nextCheckLabel={checking ? "сейчас…" : countdown}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-white px-4 lg:px-6">
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
                  ? `Последняя: ${lastCheckLabel} · следующая через ${countdown}`
                  : `Следующая проверка через ${countdown}`}
            </span>
            {view !== "add" && view !== "telegram" ? (
              <button
                type="button"
                onClick={() => void checkAll("manual")}
                disabled={checking || loading}
                className="h-8 bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              >
                {checking ? "Проверяю…" : "Проверить сейчас"}
              </button>
            ) : null}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

          {view === "add" ? (
            <AddSiteForm
              onCreated={() => {
                void load();
                setView("sites");
              }}
            />
          ) : view === "telegram" ? (
            <TelegramPanel />
          ) : loading ? (
            <p className="text-sm text-gray-500">Загрузка…</p>
          ) : (
            <SitesTable sites={visibleSites} onChanged={() => void load()} />
          )}

          {!loading &&
          view !== "add" &&
          view !== "telegram" &&
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
