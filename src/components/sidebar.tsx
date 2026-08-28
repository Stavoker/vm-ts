"use client";

import type { SiteStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

export type NavView = "sites" | "add" | "telegram" | "payments" | "requirements" | SiteStatus;

type Props = {
  view: NavView;
  onNavigate: (view: NavView) => void;
  counts: Record<"all" | SiteStatus, number>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  nextCheckLabel: string;
};

const STATUS_ITEMS: SiteStatus[] = [
  "online",
  "payment_required",
  "blocked",
  "error",
  "offline",
];

export function Sidebar({
  view,
  onNavigate,
  counts,
  mobileOpen,
  onCloseMobile,
  nextCheckLabel,
}: Props) {
  function go(next: NavView) {
    onNavigate(next);
    onCloseMobile();
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[var(--sidebar)] text-[var(--sidebar-text)] transition-transform ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-14 items-center border-b border-white/10 px-5">
          <span className="text-sm font-semibold tracking-wide text-white">
            Vitrina Monitor
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Главное
          </p>
          <button
            type="button"
            onClick={() => go("sites")}
            className={navClass(view === "sites")}
          >
            <span>Все сайты</span>
            <span className="tabular-nums text-xs opacity-70">{counts.all}</span>
          </button>
          <button
            type="button"
            onClick={() => go("add")}
            className={navClass(view === "add")}
          >
            Добавить сайт
          </button>
          <button
            type="button"
            onClick={() => go("telegram")}
            className={navClass(view === "telegram")}
          >
            Telegram
          </button>
          <button
            type="button"
            onClick={() => go("payments")}
            className={navClass(view === "payments")}
          >
            Оплаты Notion
          </button>
          <button
            type="button"
            onClick={() => go("requirements")}
            className={navClass(view === "requirements")}
          >
            Requirements Check
          </button>

          <p className="mb-2 mt-6 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Статусы
          </p>
          {STATUS_ITEMS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => go(status)}
              className={navClass(view === status)}
            >
              <span>{STATUS_LABELS[status]}</span>
              <span className="tabular-nums text-xs opacity-70">
                {counts[status]}
              </span>
            </button>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-3 text-xs text-gray-500">
          <div>Автопроверка: каждые 10 мин</div>
          <div className="mt-1 tabular-nums text-gray-400">
            Следующая через {nextCheckLabel}
          </div>
        </div>
      </aside>
    </>
  );
}

function navClass(active: boolean) {
  return `mb-0.5 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
    active
      ? "bg-white/10 text-white"
      : "text-gray-300 hover:bg-white/5 hover:text-white"
  }`;
}
