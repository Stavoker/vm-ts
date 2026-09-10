import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function PageIntro({
  title,
  subtitle,
  actions,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  if (!title && !subtitle && !actions) return null;
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        {title ? <h2 className="text-[22px] font-semibold tracking-tight text-[var(--text)]">{title}</h2> : null}
        {subtitle ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return <section className={`ui-card ${pad ? "ui-card-pad" : ""} ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  extra,
  icon,
}: {
  title: string;
  extra?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon ? <span className="text-[var(--accent)]">{icon}</span> : null}
        <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">{title}</h2>
      </div>
      {extra}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return <button {...props} className={`ui-btn ui-btn-${variant} ${className}`} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`ui-input ${props.className || ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`ui-select ${props.className || ""}`} />;
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`min-w-[140px] flex-1 ${className}`}>
      <span className="ui-label">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-[var(--muted)]">{icon}</div> : null}
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      {hint ? <p className="mt-1 max-w-md text-sm text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function LoadingState({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-[var(--muted)]">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
      {label}
    </div>
  );
}

export function Alert({
  tone = "error",
  children,
  className = "",
}: {
  tone?: "error" | "ok" | "warn";
  children: ReactNode;
  className?: string;
}) {
  const cls = tone === "ok" ? "ui-alert-ok" : tone === "warn" ? "ui-alert-warn" : "ui-alert-error";
  return <p className={`${cls} ${className}`}>{children}</p>;
}

export function TableShell({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[6px]">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md ui-card ui-card-pad">{children}</div>
    </div>
  );
}
