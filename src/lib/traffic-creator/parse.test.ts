import { describe, expect, it } from "vitest";
import { parseBalance, parseCampaign, parseCampaignList } from "./parse";

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

  it("unwraps nested campaign payloads", () => {
    const campaign = parseCampaign({
      data: {
        campaign: {
          campaign_id: "pw1",
          title: "Playworldhub",
          state: "paused",
          url: "http://playworldhub.com",
        },
      },
    });
    expect(campaign).toMatchObject({
      id: "pw1",
      name: "Playworldhub",
      status: "paused",
      url: "http://playworldhub.com",
    });
  });
});
