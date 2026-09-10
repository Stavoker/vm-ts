import { formatPercent, formatSignedPercent, formatSignedPoints, ratioChange } from "./format";
import type { BreakdownRow, WeeklyReportData } from "./types";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function buildKeyInsights(data: Pick<
  WeeklyReportData,
  "current" | "previous" | "daily" | "countries" | "devices" | "sources"
>): string[] {
  const insights: string[] = [];
  const sessionsChange = ratioChange(data.current.sessions, data.previous.sessions);
  if (sessionsChange != null) {
    insights.push(
      `Sessions ${sessionsChange >= 0 ? "increased" : "decreased"} by ${formatSignedPercent(Math.abs(sessionsChange)).replace("+", "")} compared with the previous week.`,
    );
  }

  const bounceChange = data.current.bounceRate - data.previous.bounceRate;
  if (data.previous.sessions > 0) {
    insights.push(
      `Bounce rate ${bounceChange <= 0 ? "improved" : "worsened"} by ${formatSignedPoints(Math.abs(bounceChange)).replace("+", "")} versus the previous week.`,
    );
  }

  const topCountry = data.countries[0];
  if (topCountry && topCountry.sessionsShare > 0) {
    insights.push(
      `${topCountry.label} generated the largest share of traffic with ${formatPercent(topCountry.sessionsShare)} of all sessions.`,
    );
  }

  const bounceDevice = [...data.devices].sort((a, b) => b.bounceRate - a.bounceRate)[0];
  if (bounceDevice && bounceDevice.sessions > 0) {
    insights.push(
      `${capitalize(bounceDevice.label)} traffic had the highest bounce rate at ${formatPercent(bounceDevice.bounceRate)}.`,
    );
  }

  const topSource = data.sources[0];
  if (topSource && topSource.sessionsShare > 0) {
    insights.push(
      `${topSource.label} generated ${formatPercent(topSource.sessionsShare)} of total sessions.`,
    );
  }

  const peakDay = [...data.daily].sort((a, b) => b.sessions - a.sessions)[0];
  if (peakDay) {
    insights.push(`${weekdayName(peakDay.key)} had the highest traffic volume of the week.`);
  }

  const newUserShare = data.current.totalUsers > 0 ? data.current.newUsers / data.current.totalUsers : 0;
  if (data.current.totalUsers > 0) {
    insights.push(`New users accounted for ${formatPercent(newUserShare)} of total users.`);
  }

  return unique(insights).slice(0, 7);
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
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
