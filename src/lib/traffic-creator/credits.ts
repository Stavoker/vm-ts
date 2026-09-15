import { addUtcDays, getAppTimezone, getZonedParts, ymd } from "@/lib/analytics/timezone";
import type { AnalyticsSite } from "@/lib/analytics/types";
import {
  clampAnalyticsDays,
  filterCreditSeries,
  inclusiveDayCount,
  mergeCreditSeries,
  mergeCreditTiers,
  type TrafficCampaign,
  type TrafficCampaignCredits,
  type TrafficCreditUsage,
} from "./parse";

export function daysToFetchForRange(startDate: string, endDate: string, now = new Date()): number {
  const today = ymd(getZonedParts(now, getAppTimezone()));
  const fetchEnd = endDate > today ? today : endDate;
  const fromStartToToday = inclusiveDayCount(startDate, today);
  const rangeDays = inclusiveDayCount(startDate, fetchEnd);
  return clampAnalyticsDays(Math.max(fromStartToToday, rangeDays));
}

export function trimCampaignCredits(
  campaign: TrafficCampaignCredits,
  startDate: string,
  endDate: string,
): TrafficCampaignCredits {
  const series = filterCreditSeries(campaign.series, startDate, endDate);
  const total = series.reduce((sum, row) => sum + row.credits, 0);
  const days = Math.max(1, inclusiveDayCount(startDate, endDate));
  return {
    ...campaign,
    series,
    total,
    perDayAvg: total / days,
  };
}

export function aggregateCreditUsage(input: {
  campaigns: TrafficCampaignCredits[];
  balanceCredits: number | null;
  startDate: string;
  endDate: string;
  label: string;
  partialErrors?: TrafficCreditUsage["partialErrors"];
}): TrafficCreditUsage {
  const campaigns = input.campaigns.map((campaign) =>
    trimCampaignCredits(campaign, input.startDate, input.endDate),
  );
  const series = mergeCreditSeries(campaigns.map((campaign) => campaign.series));
  const totalSpent = series.reduce((sum, row) => sum + row.credits, 0);
  const days = Math.max(1, inclusiveDayCount(input.startDate, input.endDate));
  return {
    range: {
      startDate: input.startDate,
      endDate: input.endDate,
      label: input.label,
      days,
    },
    balanceCredits: input.balanceCredits,
    totalSpent,
    perDayAvg: totalSpent / days,
    series,
    tiers: mergeCreditTiers(campaigns.map((campaign) => campaign.tiers)),
    campaigns: campaigns.sort((a, b) => b.total - a.total),
    partialErrors: input.partialErrors ?? [],
  };
}

export function campaignMatchesSite(campaign: TrafficCampaign, site: Pick<AnalyticsSite, "name" | "domain" | "url">): boolean {
  const haystack = normalizeMatchText([campaign.name, campaign.url, campaign.id].filter(Boolean).join(" "));
  const needles = [site.name, site.domain, site.url]
    .filter(Boolean)
    .flatMap((value) => matchVariants(String(value)));
  if (needles.some((needle) => needle.length >= 3 && haystack.includes(needle))) return true;

  const campaignCompact = normalizeMatchText(campaign.name);
  if (campaignCompact.length >= 3 && campaignCompact.length <= 5) {
    const siteCompact = normalizeMatchText([site.name, site.domain].filter(Boolean).join(" "));
    if (isSubsequence(campaignCompact, siteCompact)) return true;
  }
  return false;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index >= needle.length) return true;
  }
  return false;
}

function matchVariants(value: string): string[] {
  const raw = value.trim().toLowerCase();
  if (!raw) return [];
  const noProtocol = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const host = noProtocol.replace(/^www\./, "");
  const noTld = host.replace(/\.[a-z0-9]+$/i, "");
  const compact = noTld.replace(/[^a-z0-9]+/g, "");
  const spaced = noTld.replace(/[^a-z0-9]+/g, " ").trim();
  const acronym = spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  return [...new Set([raw, host, noTld, compact, spaced.replace(/\s+/g, ""), acronym].filter((item) => item.length >= 3))];
}

function normalizeMatchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function emptyCreditUsage(startDate: string, endDate: string, label: string): TrafficCreditUsage {
  return {
    range: {
      startDate,
      endDate,
      label,
      days: inclusiveDayCount(startDate, endDate),
    },
    balanceCredits: null,
    totalSpent: 0,
    perDayAvg: 0,
    series: [],
    tiers: [],
    campaigns: [],
    partialErrors: [],
  };
}

/** Keep tree-shaken timezone helper available for tests that stub “today”. */
export function shiftDays(dateYmd: string, days: number): string {
  return addUtcDays(dateYmd, days);
}
