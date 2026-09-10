import { describe, expect, it } from "vitest";
import { aggregateOverviews, mergeBreakdownRows } from "./aggregate";
import { computeRates } from "./format";

describe("analytics aggregation", () => {
  it("weights bounce and engagement by sessions instead of averaging rates", () => {
    const merged = aggregateOverviews([
      {
        activeUsers: 100,
        totalUsers: 110,
        newUsers: 80,
        sessions: 100,
        engagedSessions: 90,
        pageViews: 300,
        bounceRate: 0.1,
        engagementRate: 0.9,
        viewsPerSession: 3,
        averageSessionDuration: 100,
      },
      {
        activeUsers: 50,
        totalUsers: 55,
        newUsers: 40,
        sessions: 300,
        engagedSessions: 150,
        pageViews: 600,
        bounceRate: 0.5,
        engagementRate: 0.5,
        viewsPerSession: 2,
        averageSessionDuration: 50,
      },
    ]);

    expect(merged.sessions).toBe(400);
    expect(merged.engagedSessions).toBe(240);
    expect(merged.bounceRate).toBeCloseTo(0.4);
    expect(merged.engagementRate).toBeCloseTo(0.6);
    expect(merged.viewsPerSession).toBeCloseTo(2.25);
    expect(merged.averageSessionDuration).toBeCloseTo((100 * 100 + 50 * 300) / 400);
  });

  it("merges country rows and recomputes shares", () => {
    const rows = mergeBreakdownRows([
      {
        keys: { country: "France" },
        label: "France",
        activeUsers: 10,
        totalUsers: 10,
        sessions: 20,
        pageViews: 40,
        engagedSessions: 16,
        bounceRate: 0.2,
        engagementRate: 0.8,
        sessionsShare: 0,
        usersShare: 0,
      },
      {
        keys: { country: "France" },
        label: "France",
        activeUsers: 5,
        totalUsers: 6,
        sessions: 30,
        pageViews: 50,
        engagedSessions: 24,
        bounceRate: 0.2,
        engagementRate: 0.8,
        sessionsShare: 0,
        usersShare: 0,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessions).toBe(50);
    expect(rows[0].bounceRate).toBeCloseTo(computeRates(50, 40).bounceRate);
    expect(rows[0].sessionsShare).toBe(1);
  });
});
