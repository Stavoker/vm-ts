"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { AddSiteForm } from "@/components/add-site-form";
import { TrafficAnalyticsPanel } from "@/components/analytics/traffic-analytics-panel";
import { Sidebar, type NavView } from "@/components/sidebar";
import { SitesTable } from "@/components/sites-table";
import { PaymentsPanel } from "@/components/payments-panel";
import { RequirementsCheckPanel } from "@/components/requirements-check-panel";
import { TelegramPanel } from "@/components/telegram-panel";
import { TrafficCreatorPanel } from "@/components/traffic-creator-panel";
import { Alert, Button, LoadingState } from "@/components/ui/primitives";
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

const PAGE_SUBTITLE: Partial<Record<NavView, string>> = {
  sites: "Мониторинг сайтов, статусы и быстрые действия",
  add: "Добавьте сайт в мониторинг и при необходимости подключите GA4",
  telegram: "Чаты для уведомлений о статусах",
  payments: "Напоминания об оплатах из Notion",
  requirements: "Автоматическая проверка требований сайта",
  analytics: "Трафик, источники и поведение пользователей",
  traffic: "Баланс и кампании Traffic Creator",
};

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
    const timer = setTimeout(() => {
      void refreshSites();
    }, 0);
    return () => clearTimeout(timer);
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
    if (
      view === "sites" ||
      view === "add" ||
      view === "telegram" ||
      view === "payments" ||
      view === "requirements" ||
      view === "analytics" ||
      view === "traffic"
    ) {
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
            : view === "analytics"
              ? "Traffic Analytics"
              : view === "traffic"
                ? "Traffic Creator"
            : view === "sites"
            ? "Все сайты"
            : STATUS_LABELS[view];

  const subtitle = PAGE_SUBTITLE[view] || (isStatusView(view) ? "Сайты с выбранным статусом" : undefined);

  const countdown = formatCountdown(nextRefreshAt - now);
  const lastCheckLabel = lastCheckAt
    ? new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(lastCheckAt))
    : null;

  const showCheck = view !== "add" && view !== "telegram" && view !== "payments" && view !== "requirements" && view !== "analytics" && view !== "traffic";

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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:ml-[272px]">
        <header className="ui-header flex shrink-0 items-center justify-between px-4 lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)] hover:bg-black/[0.05] lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Меню"
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-[20px] font-semibold tracking-tight text-[var(--text)]">{title}</h1>
                {subtitle ? (
                  <p className="hidden truncate text-[12px] text-[var(--muted)] sm:block">{subtitle}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[var(--muted)] sm:inline">
              {checking
                ? "Идёт проверка…"
                : lastCheckLabel
                  ? `Последняя проверка: ${lastCheckLabel} · обновление через ${countdown}`
                  : `Обновление данных через ${countdown}`}
            </span>
            {showCheck ? (
              <Button
                type="button"
                onClick={() => void checkAll()}
                disabled={checking || loading}
              >
                {checking ? "Проверяю…" : "Проверить сейчас"}
              </Button>
            ) : null}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-8">
          {error ? <Alert className="mb-4">{error}</Alert> : null}

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
          ) : view === "analytics" ? (
            <TrafficAnalyticsPanel sites={sites} />
          ) : view === "traffic" ? (
            <TrafficCreatorPanel />
          ) : loading ? (
            <LoadingState />
          ) : (
            <SitesTable sites={visibleSites} onChanged={() => void refreshSites()} />
          )}

          {!loading &&
          view !== "add" &&
          view !== "telegram" &&
          view !== "payments" &&
          view !== "requirements" &&
          view !== "analytics" &&
          view !== "traffic" &&
          isStatusView(view) ? (
            <p className="mt-4 text-xs text-[var(--muted)]">
              Показано {visibleSites.length} из {sites.length}
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
