import { describe, expect, it } from "vitest";
import { parseBalance, parseCampaign, parseCampaignCredits, parseCampaignList } from "./parse";

describe("traffic creator parsers", () => {
  it("reads balance credits and per-tier remaining", () => {
    expect(
      parseBalance({
        credits: 125000,
        by_tier: { standard: 80000, premium: 45000 },
      }),
    ).toEqual({
      credits: 125000,
      tiers: [
        { tier: "standard", credits: 80000 },
        { tier: "premium", credits: 45000 },
      ],
    });
  });

  it("sums credits when the API returns amounts by tier", () => {
    expect(
      parseBalance({
        credits: {
          economy: 1000,
          professional: 25000,
          expert: 400,
          seo: 0,
        },
      }),
    ).toEqual({
      credits: 26400,
      tiers: [
        { tier: "economy", credits: 1000 },
        { tier: "professional", credits: 25000 },
        { tier: "expert", credits: 400 },
        { tier: "seo", credits: 0 },
      ],
    });
  });

  it("parses campaign lists with next_cursor", () => {
    const parsed = parseCampaignList({
      campaigns: [
        {
          id: "cmp_1",
          name: "Horizon Skill",
          status: "active",
          daily_limit: 20000,
          total_target: 100000,
          delivered_visits: 1200,
          remaining_visits: 98800,
          settings_version: 3,
        },
      ],
      next_cursor: "abc",
    });
    expect(parsed.nextCursor).toBe("abc");
    expect(parsed.campaigns[0]).toMatchObject({
      id: "cmp_1",
      name: "Horizon Skill",
      daily_limit: 20000,
      delivered: 1200,
      remaining: 98800,
      settings_version: 3,
    });
  });

  it("parses campaign credit usage series from analytics payloads", () => {
    const credits = parseCampaignCredits(
      {
        project: { id: "c1", name: "Horizon", status: "active", tier: "professional" },
        totals: { visitors: 100 },
        delivery_quality: { billed: 90 },
        credits: {
          total: 90,
          per_day_avg: 45,
          series: [
            { date: "2026-09-14", credits: 40 },
            { date: "2026-09-15", credits: 50 },
          ],
          tiers: [{ tier: "professional", label: "Professional", credits: 90, share: 100 }],
        },
      },
      { id: "c1", name: "Horizon", status: "active", traffic_tier: "professional" },
    );
    expect(credits.total).toBe(90);
    expect(credits.series).toHaveLength(2);
    expect(credits.tiers[0]).toMatchObject({ tier: "professional", share: 1 });
  });

  it("reads total_hits as delivered visits", () => {
    expect(
      parseCampaign({
        id: "c2",
        name: "PWH",
        status: "active",
        total_hits: 28865,
        tier: "professional",
      }),
    ).toMatchObject({ delivered: 28865, traffic_tier: "professional" });
  });
});
