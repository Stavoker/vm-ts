import { formatPercent, formatSignedPercent, formatSignedPointsUk, ratioChange } from "./format";
import { translateCountryLabel, translateDeviceLabel } from "./pdf-i18n";
import type { BreakdownRow, WeeklyReportData } from "./types";

const WEEKDAY = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];

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
        ? `Сесії зросли на ${abs} порівняно з минулим тижнем.`
        : `Сесії знизилися на ${abs} порівняно з минулим тижнем.`,
    );
  }

  const bounceChange = data.current.bounceRate - data.previous.bounceRate;
  if (data.previous.sessions > 0) {
    const abs = formatSignedPointsUk(Math.abs(bounceChange)).replace("+", "");
    insights.push(
      bounceChange <= 0
        ? `Показник відмов покращився на ${abs} порівняно з минулим тижнем.`
        : `Показник відмов погіршився на ${abs} порівняно з минулим тижнем.`,
    );
  }

  const topCountry = data.countries[0];
  if (topCountry && topCountry.sessionsShare > 0) {
    insights.push(
      `${translateCountryLabel(topCountry.label)} забезпечила найбільшу частку трафіку — ${formatPercent(topCountry.sessionsShare)} усіх сесій.`,
    );
  }

  const bounceDevice = [...data.devices].sort((a, b) => b.bounceRate - a.bounceRate)[0];
  if (bounceDevice && bounceDevice.sessions > 0) {
    insights.push(
      `Трафік з пристроїв «${translateDeviceLabel(bounceDevice.label)}» мав найвищий показник відмов — ${formatPercent(bounceDevice.bounceRate)}.`,
    );
  }

  const topSource = data.sources[0];
  if (topSource && topSource.sessionsShare > 0) {
    insights.push(`${topSource.label} забезпечило ${formatPercent(topSource.sessionsShare)} усіх сесій.`);
  }

  const peakDay = [...data.daily].sort((a, b) => b.sessions - a.sessions)[0];
  if (peakDay) {
    insights.push(`Найбільший обсяг трафіку був у ${weekdayName(peakDay.key)}.`);
  }

  const newUserShare = data.current.totalUsers > 0 ? data.current.newUsers / data.current.totalUsers : 0;
  if (data.current.totalUsers > 0) {
    insights.push(`Нові користувачі становили ${formatPercent(newUserShare)} від усіх користувачів.`);
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
