"use client";

import type { SiteStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import {
  Activity,
  AlertTriangle,
  Ban,
  BarChart3,
  CircleOff,
  CreditCard,
  Globe,
  Plus,
  Send,
  ShieldCheck,
  Signal,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavView =
  | "sites"
  | "add"
  | "telegram"
  | "payments"
  | "requirements"
  | "analytics"
  | "traffic"
  | SiteStatus;

type Props = {
  view: NavView;
  onNavigate: (view: NavView) => void;
  counts: Record<"all" | SiteStatus, number>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  nextRefreshLabel: string;
};

const STATUS_ITEMS: { id: SiteStatus; icon: LucideIcon }[] = [
  { id: "online", icon: Signal },
  { id: "payment_required", icon: CreditCard },
  { id: "blocked", icon: Ban },
  { id: "error", icon: AlertTriangle },
  { id: "offline", icon: CircleOff },
];

const STATUS_TINT: Record<SiteStatus, string> = {
  online: "bg-[#e8f8ee] text-[#248a3d]",
  payment_required: "bg-[#fff4e0] text-[#9a6700]",
  blocked: "bg-[#ffe9eb] text-[#d70015]",
  error: "bg-[#fff4e0] text-[#c93400]",
  offline: "bg-[#f2f2f7] text-[#6e6e73]",
};

export function Sidebar({
  view,
  onNavigate,
  counts,
  mobileOpen,
  onCloseMobile,
  nextRefreshLabel,
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
          className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px] lg:hidden"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-[var(--border)] bg-[var(--sidebar)] text-[var(--sidebar-text)] shadow-[var(--shadow)] backdrop-blur-xl transition-transform ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center gap-3 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-[var(--accent)] text-white">
            <Globe size={16} />
          </span>
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-[var(--text)]">Vitrina</div>
            <div className="text-[11px] text-[var(--muted)]">Monitor</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Главное
          </p>
          <NavButton active={view === "sites"} onClick={() => go("sites")} icon={Globe} count={counts.all}>
            Все сайты
          </NavButton>
          <NavButton active={view === "add"} onClick={() => go("add")} icon={Plus}>
            Добавить сайт
          </NavButton>
          <NavButton active={view === "telegram"} onClick={() => go("telegram")} icon={Send}>
            Telegram
          </NavButton>
          <NavButton active={view === "payments"} onClick={() => go("payments")} icon={Wallet}>
            Оплаты Notion
          </NavButton>
          <NavButton active={view === "requirements"} onClick={() => go("requirements")} icon={ShieldCheck}>
            Requirements Check
          </NavButton>
          <NavButton active={view === "analytics"} onClick={() => go("analytics")} icon={BarChart3}>
            Traffic Analytics
          </NavButton>
          <NavButton active={view === "traffic"} onClick={() => go("traffic")} icon={Activity}>
            Traffic Creator
          </NavButton>

          <p className="mb-2 mt-7 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Статусы
          </p>
          {STATUS_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              active={view === item.id}
              onClick={() => go(item.id)}
              icon={item.icon}
              count={counts[item.id]}
              countClass={STATUS_TINT[item.id]}
            >
              {STATUS_LABELS[item.id]}
            </NavButton>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] px-4 py-4 text-[11px] leading-relaxed text-[var(--muted)]">
          <div>Обновление данных: каждые 10 мин</div>
          <div className="mt-1 tabular-nums">Следующее через {nextRefreshLabel}</div>
        </div>
      </aside>
    </>
  );
}

function NavButton({
  active,
  onClick,
  icon: Icon,
  count,
  countClass,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  count?: number;
  countClass?: string;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left text-[13.5px] transition-all duration-150 ${
        active
          ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
          : "text-[var(--text)] hover:bg-black/[0.035]"
      }`}
    >
      <Icon size={16} strokeWidth={1.8} />
      <span className="flex-1">{children}</span>
      {count != null ? (
        <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums ${countClass || "bg-[#f2f2f7] text-[var(--muted)]"}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
