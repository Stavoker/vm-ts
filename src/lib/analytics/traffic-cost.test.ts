import { describe, expect, it } from "vitest";
import { buildTrafficCostSummary, costForVisits, findPack, requirePack } from "./traffic-cost";

describe("traffic cost", () => {
  it("prices the selected 600k pack at $0.19 per 1000 visits", () => {
    const pack = requirePack(600_000);
    expect(pack.priceUsd).toBe(114.95);
    expect(pack.cpmUsd).toBe(0.19);
    expect(costForVisits(1000, pack.cpmUsd)).toBeCloseTo(0.19);
    expect(costForVisits(13_284, pack.cpmUsd)).toBeCloseTo(2.52396);
  });

  it("rejects unknown packs", () => {
    expect(findPack(123)).toBeNull();
  });

  it("summarizes weekly cost from the chosen pack", () => {
    const summary = buildTrafficCostSummary({
      packVisits: 600_000,
      sessions: 12_000,
      users: 8_000,
      previousSessions: 10_000,
      previousUsers: 7_000,
    });
    expect(summary.activePack.visits).toBe(600_000);
    expect(summary.professionalCpmUsd).toBe(0.19);
    expect(summary.expertCpmUsd).toBe(0.27);
    expect(summary.sessionsCostUsd).toBeCloseTo(2.28);
    expect(summary.usersCostUsd).toBeCloseTo(1.52);
    expect(summary.previousSessionsCostUsd).toBeCloseTo(1.9);
  });
});
