import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function StatCard({
  title,
  value,
  hint,
  help,
  icon: Icon,
  loading,
  error,
  tint = "blue",
}: {
  title: string;
  value: string;
  hint?: string;
  help?: string;
  icon: LucideIcon;
  loading?: boolean;
  error?: string | null;
  tint?: "blue" | "green" | "orange" | "red" | "gray" | "purple";
}) {
  const tints: Record<string, string> = {
    blue: "bg-[#eaf3ff] text-[#0071e3]",
    green: "bg-[#e8f8ee] text-[#248a3d]",
    orange: "bg-[#fff4e0] text-[#9a6700]",
    red: "bg-[#ffe9eb] text-[#d70015]",
    gray: "bg-[#f2f2f7] text-[#6e6e73]",
    purple: "bg-[#f3eaff] text-[#8944ab]",
  };

  return (
    <div className="ui-card ui-card-pad transition-shadow duration-200 hover:shadow-[var(--shadow-hover)]" title={help}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{title}</div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${tints[tint]}`}>
          <Icon size={16} strokeWidth={1.8} />
        </span>
      </div>
      {error ? (
        <p className="mt-4 text-xs text-[var(--danger)]">{error}</p>
      ) : loading ? (
        <div className="mt-4 h-8 w-24 animate-pulse rounded-md bg-[#f2f2f7]" />
      ) : (
        <>
          <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-[var(--text)]">
            {value}
          </div>
          {hint ? <div className="mt-2 text-xs text-[var(--muted)]">{hint}</div> : null}
        </>
      )}
    </div>
  );
}

export function IconLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon size={16} strokeWidth={1.8} />
      {children}
    </span>
  );
}
