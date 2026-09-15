import { describe, expect, it } from "vitest";
import { aggregateCreditUsage, campaignMatchesSite, daysToFetchForRange, trimCampaignCredits } from "./credits";
import type { TrafficCampaignCredits } from "./parse";

function campaign(partial: Partial<TrafficCampaignCredits> & Pick<TrafficCampaignCredits, "campaignId" | "campaignName" | "series">): TrafficCampaignCredits {
  return {
    status: "active",
    tier: "professional",
    total: partial.series.reduce((sum, row) => sum + row.credits, 0),
    perDayAvg: 0,
    tiers: [],
    visitors: 0,
    billed: null,
    ...partial,
  };
}

describe("traffic creator credit aggregation", () => {
  it("filters and merges daily credit spend across campaigns", () => {
    const usage = aggregateCreditUsage({
      balanceCredits: 500_000,
      startDate: "2026-09-14",
      endDate: "2026-09-15",
      label: "14–15 Sept",
      campaigns: [
        campaign({
          campaignId: "a",
          campaignName: "Horizon",
          series: [
            { date: "2026-09-13", credits: 100 },
            { date: "2026-09-14", credits: 2500 },
            { date: "2026-09-15", credits: 2000 },
          ],
        }),
        campaign({
          campaignId: "b",
          campaignName: "PWH",
          series: [
            { date: "2026-09-14", credits: 3350 },
            { date: "2026-09-15", credits: 2500 },
          ],
        }),
      ],
    });

    expect(usage.totalSpent).toBe(2500 + 2000 + 3350 + 2500);
    expect(usage.series).toEqual([
      { date: "2026-09-14", credits: 5850 },
      { date: "2026-09-15", credits: 4500 },
    ]);
    expect(usage.perDayAvg).toBeCloseTo(usage.totalSpent / 2);
    expect(usage.campaigns[0].campaignName).toBe("PWH");
  });

  it("trims campaign series to the selected window", () => {
    const trimmed = trimCampaignCredits(
      campaign({
        campaignId: "a",
        campaignName: "Horizon",
        series: [
          { date: "2026-09-13", credits: 100 },
          { date: "2026-09-14", credits: 40 },
        ],
      }),
      "2026-09-14",
      "2026-09-14",
    );
    expect(trimmed.total).toBe(40);
    expect(trimmed.series).toEqual([{ date: "2026-09-14", credits: 40 }]);
  });

  it("matches campaigns to sites by name, domain and short codes", () => {
    expect(
      campaignMatchesSite(
        { id: "1", name: "horizon-skill", status: "active", url: null, daily_limit: null, total_target: null, delivered: null, remaining: null, settings_version: null, traffic_tier: null },
        { name: "Horizon Skill", domain: "horizon-skill.com", url: "https://horizon-skill.com" },
      ),
    ).toBe(true);
    expect(
      campaignMatchesSite(
        { id: "2", name: "PWH", status: "active", url: null, daily_limit: null, total_target: null, delivered: null, remaining: null, settings_version: null, traffic_tier: null },
        { name: "Playworldhub", domain: "playworldhub.com", url: "http://playworldhub.com" },
      ),
    ).toBe(true);
  });

  it("clamps analytics day windows to the Account API limit", () => {
    expect(daysToFetchForRange("2026-01-01", "2026-09-15", new Date("2026-09-15T12:00:00Z"))).toBe(90);
    expect(daysToFetchForRange("2026-09-09", "2026-09-15", new Date("2026-09-15T12:00:00Z"))).toBe(7);
  });
});
