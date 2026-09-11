import { describe, expect, it } from "vitest";
import { buildKeyInsights } from "./insights";
import { emptyOverview } from "./aggregate";

describe("buildKeyInsights", () => {
  it("builds deterministic insights from metrics without an LLM", () => {
    const insights = buildKeyInsights({
      current: {
        ...emptyOverview(),
        sessions: 32450,
        totalUsers: 13000,
        newUsers: 9000,
        bounceRate: 0.182,
      },
      previous: {
        ...emptyOverview(),
        sessions: 28870,
        totalUsers: 11000,
        bounceRate: 0.213,
      },
      daily: [
        { key: "2026-09-01", label: "Mon", activeUsers: 1, newUsers: 1, sessions: 10, pageViews: 20, bounceRate: 0.2, engagementRate: 0.8 },
        { key: "2026-09-02", label: "Tue", activeUsers: 1, newUsers: 1, sessions: 50, pageViews: 20, bounceRate: 0.2, engagementRate: 0.8 },
      ],
      countries: [
        {
          keys: { country: "France" },
          label: "France",
          activeUsers: 10,
          totalUsers: 10,
          sessions: 34,
          pageViews: 10,
          engagedSessions: 30,
          bounceRate: 0.1,
          engagementRate: 0.9,
          sessionsShare: 0.342,
          usersShare: 0.3,
        },
      ],
      devices: [
        {
          keys: { deviceCategory: "mobile" },
          label: "mobile",
          activeUsers: 1,
          totalUsers: 1,
          sessions: 10,
          pageViews: 10,
          engagedSessions: 7,
          bounceRate: 0.261,
          engagementRate: 0.739,
          sessionsShare: 0.5,
          usersShare: 0.5,
        },
      ],
      sources: [
        {
          keys: { sessionSource: "(direct)", sessionMedium: "(none)" },
          label: "direct / none",
          activeUsers: 1,
          totalUsers: 1,
          sessions: 20,
          pageViews: 10,
          engagedSessions: 18,
          bounceRate: 0.1,
          engagementRate: 0.8,
          sessionsShare: 0.68,
          usersShare: 0.6,
        },
      ],
    });

    expect(insights.length).toBeGreaterThanOrEqual(3);
    expect(insights.length).toBeLessThanOrEqual(7);
    expect(insights.some((item) => item.includes("Сесії зросли"))).toBe(true);
    expect(insights.some((item) => item.includes("Франція"))).toBe(true);
    expect(insights.some((item) => /найвищий показник відмов/i.test(item))).toBe(true);
  });
});
