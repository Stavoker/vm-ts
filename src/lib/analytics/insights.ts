import { formatPercent, formatSignedPercent, formatSignedPointsRu, ratioChange } from "./format";
import { translateCountryLabel, translateDeviceLabel } from "./pdf-i18n";
import type { BreakdownRow, WeeklyReportData } from "./types";

const WEEKDAY = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

export function buildKeyInsights(data: Pick<
  WeeklyReportData,
  "current" | "previous" | "daily" | "countries" | "devices" | "sources"
>): string[] {
  const insights: string[] = [];
  const sessionsChange = ratioChange(data.current.sessions, data.previous.sessions);
  if (sessionsChange != null) {
    const abs = formatSignedPercent(Math.abs(sessionsChange)).replace("+", "");
    insights.push(
      sessionsChange >= 0
        ? `Сессии выросли на ${abs} по сравнению с прошлой неделей.`
        : `Сессии снизились на ${abs} по сравнению с прошлой неделей.`,
    );
  }

  const bounceChange = data.current.bounceRate - data.previous.bounceRate;
  if (data.previous.sessions > 0) {
    const abs = formatSignedPointsRu(Math.abs(bounceChange)).replace("+", "");
    insights.push(
      bounceChange <= 0
        ? `Показатель отказов улучшился на ${abs} по сравнению с прошлой неделей.`
        : `Показатель отказов ухудшился на ${abs} по сравнению с прошлой неделей.`,
    );
  }

  const topCountry = data.countries[0];
  if (topCountry && topCountry.sessionsShare > 0) {
    insights.push(
      `${translateCountryLabel(topCountry.label)} обеспечила наибольшую долю трафика — ${formatPercent(topCountry.sessionsShare)} всех сессий.`,
    );
  }

  const bounceDevice = [...data.devices].sort((a, b) => b.bounceRate - a.bounceRate)[0];
  if (bounceDevice && bounceDevice.sessions > 0) {
    insights.push(
      `Трафик с устройств «${translateDeviceLabel(bounceDevice.label)}» имел самый высокий показатель отказов — ${formatPercent(bounceDevice.bounceRate)}.`,
    );
  }

  const topSource = data.sources[0];
  if (topSource && topSource.sessionsShare > 0) {
    insights.push(`${topSource.label} обеспечил ${formatPercent(topSource.sessionsShare)} всех сессий.`);
  }

  const peakDay = [...data.daily].sort((a, b) => b.sessions - a.sessions)[0];
  if (peakDay) {
    insights.push(`Наибольший объём трафика был в ${weekdayName(peakDay.key)}.`);
  }

  const newUserShare = data.current.totalUsers > 0 ? data.current.newUsers / data.current.totalUsers : 0;
  if (data.current.totalUsers > 0) {
    insights.push(`Новые пользователи составляли ${formatPercent(newUserShare)} от всех пользователей.`);
  }

  return unique(insights).slice(0, 7);
}

function weekdayName(dateYmd: string): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAY[utcDay] || dateYmd;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function meaningfulCampaigns(rows: BreakdownRow[]): BreakdownRow[] {
  return rows.filter((row) => {
    const name = row.keys.sessionCampaignName || row.label;
    return name && name !== "(not set)" && name !== "(direct)";
  });
}
