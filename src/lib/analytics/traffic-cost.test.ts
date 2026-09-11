import { describe, expect, it } from "vitest";
import {
  TRAFFIC_CREATOR_EXPERT_STARTER_CPM_USD,
  TRAFFIC_CREATOR_STARTER_CPM_USD,
  buildTrafficCostSummary,
  costForVisits,
} from "./traffic-cost";

describe("traffic cost", () => {
  it("uses Traffic Creator Professional starter CPM of $0.33 per 1000 visits", () => {
    expect(TRAFFIC_CREATOR_STARTER_CPM_USD).toBe(0.33);
    expect(costForVisits(1000)).toBeCloseTo(0.33);
    expect(costForVisits(10_000)).toBeCloseTo(3.3);
  });

  it("prices Expert starter traffic at $0.47 per 1000 visits", () => {
    expect(TRAFFIC_CREATOR_EXPERT_STARTER_CPM_USD).toBe(0.47);
  });

  it("summarizes weekly session and user cost", () => {
    const summary = buildTrafficCostSummary({
      sessions: 12_000,
      users: 8_000,
      previousSessions: 10_000,
      previousUsers: 7_000,
    });
    expect(summary.sourceUrl).toBe("https://traffic-creator.com/");
    expect(summary.sessionsCostUsd).toBeCloseTo(3.96);
    expect(summary.usersCostUsd).toBeCloseTo(2.64);
    expect(summary.previousSessionsCostUsd).toBeCloseTo(3.3);
    expect(summary.packs.length).toBeGreaterThanOrEqual(4);
  });
});
