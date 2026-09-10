import type { ChartGranularity, DatePreset, ResolvedDateRange } from "./types";
import {
  addUtcDays,
  dateHourKey,
  formatDateLabel,
  getAppTimezone,
  getZonedParts,
  lastDayOfMonth,
  startOfIsoWeek,
  startOfMonth,
  ymd,
} from "./timezone";

const HOURLY_WARNING =
  "GA4 standard reporting returns complete hour buckets in the property timezone, not an exact UTC rolling-hour window. The first and last hours can be partial.";

export function resolveDateRange(input: {
  preset: DatePreset;
  from?: string;
  to?: string;
  granularity?: ChartGranularity;
  now?: Date;
  timezone?: string;
}): ResolvedDateRange {
  const timezone = input.timezone || getAppTimezone();
  const now = input.now || new Date();
  const nowParts = getZonedParts(now, timezone);
  const today = ymd(nowParts);
  const yesterday = addUtcDays(today, -1);

  let startDate = today;
  let endDate = today;
  let startDateHour: string | undefined;
  let endDateHour: string | undefined;
  let usesHourly = false;
  let warning: string | undefined;
  let label = "";

  switch (input.preset) {
    case "today":
      startDate = today;
      endDate = today;
      label = `Today (${formatDateLabel(today)}, ${timezone})`;
      break;
    case "yesterday":
      startDate = yesterday;
      endDate = yesterday;
      label = `Yesterday (${formatDateLabel(yesterday)}, ${timezone})`;
      break;
    case "last_7d":
      startDate = addUtcDays(today, -6);
      endDate = today;
      label = `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`;
      break;
    case "last_14d":
      startDate = addUtcDays(today, -13);
      endDate = today;
      label = `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`;
      break;
    case "last_30d":
      startDate = addUtcDays(today, -29);
      endDate = today;
      label = `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`;
      break;
    case "last_90d":
      startDate = addUtcDays(today, -89);
      endDate = today;
      label = `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`;
      break;
    case "this_month":
      startDate = startOfMonth(today);
      endDate = today;
      label = `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`;
      break;
    case "previous_month": {
      const prevMonthLast = addUtcDays(startOfMonth(today), -1);
      startDate = startOfMonth(prevMonthLast);
      endDate = lastDayOfMonth(prevMonthLast);
      label = `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`;
      break;
    }
    case "last_24h":
    case "last_36h": {
      const hours = input.preset === "last_24h" ? 24 : 36;
      const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const fromParts = getZonedParts(from, timezone);
      startDate = ymd(fromParts);
      endDate = today;
      startDateHour = dateHourKey(fromParts);
      endDateHour = dateHourKey(nowParts);
      usesHourly = true;
      warning = HOURLY_WARNING;
      label = `Hourly buckets overlapping the last ${hours} hours (${timezone})`;
      break;
    }
    case "custom": {
      const parsed = parseCustomRange(input.from, input.to);
      startDate = parsed.startDate;
      endDate = parsed.endDate;
      startDateHour = parsed.startDateHour;
      endDateHour = parsed.endDateHour;
      usesHourly = Boolean(parsed.startDateHour);
      if (usesHourly) warning = HOURLY_WARNING;
      label = parsed.label;
      break;
    }
    default:
      startDate = addUtcDays(today, -6);
      endDate = today;
      label = `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`;
  }

  const requested = input.granularity || "auto";
  const granularity = resolveGranularity(requested, startDate, endDate, usesHourly);

  return {
    preset: input.preset,
    startDate,
    endDate,
    startDateHour,
    endDateHour,
    usesHourly: usesHourly || granularity === "hourly",
    granularity,
    label,
    warning,
    timezone,
  };
}

export function resolveGranularity(
  requested: ChartGranularity,
  startDate: string,
  endDate: string,
  forceHourly: boolean,
): Exclude<ChartGranularity, "auto"> {
  if (requested !== "auto") return requested;
  if (forceHourly) return "hourly";
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days <= 2) return "hourly";
  if (days <= 90) return "daily";
  return "weekly";
}

export function previousPeriod(range: Pick<ResolvedDateRange, "startDate" | "endDate">): {
  startDate: string;
  endDate: string;
} {
  const start = Date.parse(`${range.startDate}T00:00:00Z`);
  const end = Date.parse(`${range.endDate}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  return {
    startDate: addUtcDays(range.startDate, -days),
    endDate: addUtcDays(range.startDate, -1),
  };
}

export function lastCompletedIsoWeek(now = new Date(), timezone = getAppTimezone()): {
  startDate: string;
  endDate: string;
} {
  const today = ymd(getZonedParts(now, timezone));
  const thisMonday = startOfIsoWeek(today);
  const previousMonday = addUtcDays(thisMonday, -7);
  return {
    startDate: previousMonday,
    endDate: addUtcDays(previousMonday, 6),
  };
}

export function isExactWeek(startDate: string, endDate: string): boolean {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  return days === 7;
}

function parseCustomRange(from?: string, to?: string): {
  startDate: string;
  endDate: string;
  startDateHour?: string;
  endDateHour?: string;
  label: string;
} {
  if (!from || !to) {
    throw new Error("Custom range requires from and to");
  }
  const start = parseDateTimeInput(from);
  const end = parseDateTimeInput(to);
  if (start.date > end.date || (start.date === end.date && (start.hour ?? 0) > (end.hour ?? 23))) {
    throw new Error("Custom range end must be after from");
  }
  const usesHours = start.hour != null || end.hour != null;
  if (usesHours) {
    const startHour = start.hour ?? 0;
    const endHour = end.hour ?? 23;
    return {
      startDate: start.date,
      endDate: end.date,
      startDateHour: `${start.date.replace(/-/g, "")}${padHour(startHour)}`,
      endDateHour: `${end.date.replace(/-/g, "")}${padHour(endHour)}`,
      label: `${formatDateLabel(start.date)} ${padHour(startHour)}:00 — ${formatDateLabel(end.date)} ${padHour(endHour)}:00`,
    };
  }
  return {
    startDate: start.date,
    endDate: end.date,
    label: `${formatDateLabel(start.date)} — ${formatDateLabel(end.date)}`,
  };
}

function parseDateTimeInput(value: string): { date: string; hour?: number } {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2})(?::(\d{2}))?)?/.exec(value.trim());
  if (!match) throw new Error(`Invalid date: ${value}`);
  if (match[2] == null) return { date: match[1] };
  return { date: match[1], hour: Number(match[2]) };
}

function padHour(value: number): string {
  return String(value).padStart(2, "0");
}

export function inHourRange(dateHour: string, startDateHour?: string, endDateHour?: string): boolean {
  if (!startDateHour || !endDateHour) return true;
  return dateHour >= startDateHour && dateHour <= endDateHour;
}

export function isoWeekKey(dateYmd: string): string {
  const monday = startOfIsoWeek(dateYmd);
  return monday;
}
