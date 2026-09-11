import { DEFAULT_APP_TIMEZONE } from "@/lib/constants";

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || DEFAULT_APP_TIMEZONE;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function ymd(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function dateHourKey(parts: { year: number; month: number; day: number; hour: number }): string {
  return `${parts.year}${pad2(parts.month)}${pad2(parts.day)}${pad2(parts.hour)}`;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    weekday: bag.weekday || "",
  };
}

export function addUtcDays(dateYmd: string, days: number): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

export function startOfMonth(dateYmd: string): string {
  return `${dateYmd.slice(0, 7)}-01`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function lastDayOfMonth(dateYmd: string): string {
  const [year, month] = dateYmd.split("-").map(Number);
  return `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
}

export function weekdayIndexMonday(dateYmd: string): number {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return utcDay === 0 ? 6 : utcDay - 1;
}

export function startOfIsoWeek(dateYmd: string): string {
  return addUtcDays(dateYmd, -weekdayIndexMonday(dateYmd));
}

export function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

export function parseDateHour(value: string): { date: string; hour: number } | null {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    hour: Number(match[4]),
  };
}

export function formatDateLabel(dateYmd: string, locale = "en-GB"): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatUkDateLabel(dateYmd: string): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatHourLabel(dateHour: string): string {
  const parsed = parseDateHour(dateHour);
  if (!parsed) return dateHour;
  return `${parsed.date.slice(8, 10)} ${pad2(parsed.hour)}:00`;
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
