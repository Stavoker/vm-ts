export function formatNumber(value: number, digits = 0, locale = "en-US"): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatUsd(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)}`;
}

export function formatSignedPointsUk(change: number, digits = 1): string {
  if (!Number.isFinite(change)) return "—";
  const points = change * 100;
  const sign = points > 0 ? "+" : "";
  return `${sign}${points.toFixed(digits)} в.п.`;
}

export function formatPercent(rate: number, digits = 1): string {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatSignedPercent(change: number, digits = 1): string {
  if (!Number.isFinite(change)) return "—";
  const sign = change > 0 ? "+" : "";
  return `${sign}${(change * 100).toFixed(digits)}%`;
}

export function formatSignedPoints(change: number, digits = 1): string {
  if (!Number.isFinite(change)) return "—";
  const points = change * 100;
  const sign = points > 0 ? "+" : "";
  return `${sign}${points.toFixed(digits)} pp`;
}

export function ratioChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return current === 0 && previous === 0 ? 0 : null;
  }
  return (current - previous) / previous;
}

export function pointsChange(current: number, previous: number): number {
  return current - previous;
}

export function isImprovement(metric: "bounceRate" | "default", change: number): boolean {
  if (metric === "bounceRate") return change < 0;
  return change > 0;
}

export function parseRate(value: string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

export function parseMetric(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function computeRates(sessions: number, engagedSessions: number) {
  const engagementRate = sessions > 0 ? engagedSessions / sessions : 0;
  return {
    engagementRate,
    bounceRate: sessions > 0 ? 1 - engagementRate : 0,
  };
}

export function viewsPerSession(pageViews: number, sessions: number): number {
  return sessions > 0 ? pageViews / sessions : 0;
}

export function weightedAverage(items: { weight: number; value: number }[]): number {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}
