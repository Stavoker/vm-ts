"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { AddSiteForm } from "@/components/add-site-form";
import { TrafficAnalyticsPanel } from "@/components/analytics/traffic-analytics-panel";
import { ContentFactoryPanel } from "@/components/content-factory-panel";
import { Sidebar, type NavView } from "@/components/sidebar";
import { SitesTable } from "@/components/sites-table";
import { PaymentsPanel } from "@/components/payments-panel";
import { RequirementsCheckPanel } from "@/components/requirements-check-panel";
import { TelegramPanel } from "@/components/telegram-panel";
import { TrafficCreatorPanel } from "@/components/traffic-creator-panel";
import { Alert, Button, LoadingState } from "@/components/ui/primitives";
import { CHECK_INTERVAL_MS } from "@/lib/constants";
import { reminderNeedsPayment } from "@/lib/reminders-client";
import type { PaymentReminder } from "@/lib/reminder-types";
import type { Site, SiteStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

const STATUS_SET = new Set<SiteStatus>([
  "online",
  "offline",
  "payment_required",
  "blocked",
  "error",
]);

const VALID_VIEWS = new Set<NavView>([
  "sites",
  "add",
  "telegram",
  "payments",
  "requirements",
  "analytics",
  "traffic",
  "content",
  "online",
  "offline",
  "payment_required",
  "blocked",
  "error",
]);

function isStatusView(view: NavView): view is SiteStatus {
  return STATUS_SET.has(view as SiteStatus);
}

function readViewFromUrl(): NavView {
  if (typeof window === "undefined") return "sites";
  const raw = new URLSearchParams(window.location.search).get("view");
  if (raw && VALID_VIEWS.has(raw as NavView)) return raw as NavView;
  return "sites";
}

function writeViewToUrl(view: NavView) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (view === "sites") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` === next) return;
  window.history.replaceState(window.history.state, "", next);
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
  content: "Тексты и брендовые картинки для постов. Публикуете вручную.",
  payment_required: "Сервисы и сайты, которым нужна оплата",
};

export function Dashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [duePayments, setDuePayments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckAt, setLastCheckAt] = useState<number | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState(
    () => Date.now() + CHECK_INTERVAL_MS,
  );
  const [now, setNow] = useState(() => Date.now());
  const [view, setViewState] = useState<NavView>("sites");
  const [mobileOpen, setMobileOpen] = useState(false);
  const checkingRef = useRef(false);

  const setView = useCallback((next: NavView) => {
    setViewState(next);
    writeViewToUrl(next);
  }, []);

  useEffect(() => {
    const initial = readViewFromUrl();
    if (initial !== "sites") setViewState(initial);
    const onPopState = () => setViewState(readViewFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const refreshPayments = useCallback(async () => {
    try {
      const response = await fetch("/api/reminders", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { reminders?: PaymentReminder[] };
      const reminders = data.reminders ?? [];
      setDuePayments(
        reminders.filter((item) => reminderNeedsPayment(item.status, item.due_date)).length,
      );
    } catch {
      // Sites still load if Notion reminders fail.
    }
  }, []);

  const refreshSites = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/sites");
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
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
      void refreshPayments();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshSites, refreshPayments]);

  useEffect(() => {
    const startup = setTimeout(() => {
      void refreshSites();
      void refreshPayments();
    }, 1500);

    const interval = setInterval(() => {
      void refreshSites();
      void refreshPayments();
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
    next.payment_required = duePayments;
    return next;
  }, [sites, duePayments]);

  const visibleSites = useMemo(() => {
    if (
      view === "sites" ||
      view === "add" ||
      view === "telegram" ||
      view === "payments" ||
      view === "requirements" ||
      view === "analytics" ||
      view === "traffic" ||
      view === "content"
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
            ? "Проверка требований"
            : view === "analytics"
              ? "Аналитика трафика"
              : view === "traffic"
                ? "Traffic Creator"
              : view === "content"
                ? "Контент-завод"
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

  const showCheck =
    view !== "add" &&
    view !== "telegram" &&
    view !== "payments" &&
    view !== "payment_required" &&
    view !== "requirements" &&
    view !== "analytics" &&
    view !== "traffic" &&
    view !== "content";

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
          ) : view === "payments" || view === "payment_required" ? (
            <PaymentsPanel
              dueOnly={view === "payment_required"}
              onChanged={() => void refreshPayments()}
            />
          ) : view === "requirements" ? (
            <RequirementsCheckPanel />
          ) : view === "analytics" ? (
            <TrafficAnalyticsPanel sites={sites} />
          ) : view === "traffic" ? (
            <TrafficCreatorPanel />
          ) : view === "content" ? (
            <ContentFactoryPanel sites={sites} />
          ) : loading ? (
            <LoadingState />
          ) : (
            <SitesTable sites={visibleSites} onChanged={() => void refreshSites()} />
          )}

          {!loading &&
          view !== "add" &&
          view !== "telegram" &&
          view !== "payments" &&
          view !== "payment_required" &&
          view !== "requirements" &&
          view !== "analytics" &&
          view !== "traffic" &&
          view !== "content" &&
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
