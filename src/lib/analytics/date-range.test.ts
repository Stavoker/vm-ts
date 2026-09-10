import { describe, expect, it } from "vitest";
import { previousPeriod, resolveDateRange, resolveGranularity } from "./date-range";
import { addUtcDays, inclusiveDayCount, startOfIsoWeek } from "./timezone";

describe("resolveDateRange", () => {
  const now = new Date("2026-09-10T12:00:00Z");

  it("resolves last 7 days as 7 inclusive calendar days", () => {
    const range = resolveDateRange({ preset: "last_7d", now, timezone: "UTC" });
    expect(range.startDate).toBe("2026-09-04");
    expect(range.endDate).toBe("2026-09-10");
    expect(range.granularity).toBe("daily");
    expect(range.usesHourly).toBe(false);
  });

  it("uses hourly buckets for last 24 hours and labels the actual window", () => {
    const range = resolveDateRange({ preset: "last_24h", now, timezone: "UTC" });
    expect(range.usesHourly).toBe(true);
    expect(range.granularity).toBe("hourly");
    expect(range.startDateHour).toBe("2026090912");
    expect(range.endDateHour).toBe("2026091012");
    expect(range.warning).toMatch(/hour buckets/i);
  });

  it("parses a custom 7-day range", () => {
    const range = resolveDateRange({
      preset: "custom",
      from: "2026-09-01",
      to: "2026-09-07",
      now,
      timezone: "UTC",
    });
    expect(inclusiveDayCount(range.startDate, range.endDate)).toBe(7);
    expect(range.startDate).toBe("2026-09-01");
    expect(range.endDate).toBe("2026-09-07");
  });

  it("computes the previous equal-length period", () => {
    expect(previousPeriod({ startDate: "2026-09-01", endDate: "2026-09-07" })).toEqual({
      startDate: "2026-08-25",
      endDate: "2026-08-31",
    });
  });

  it("auto-selects hourly, daily, then weekly granularity", () => {
    expect(resolveGranularity("auto", "2026-09-09", "2026-09-10", false)).toBe("hourly");
    expect(resolveGranularity("auto", "2026-08-12", "2026-09-10", false)).toBe("daily");
    expect(resolveGranularity("auto", "2026-01-01", "2026-09-10", false)).toBe("weekly");
  });

  it("starts ISO weeks on Monday", () => {
    expect(startOfIsoWeek("2026-09-10")).toBe("2026-09-07");
    expect(addUtcDays(startOfIsoWeek("2026-09-10"), 6)).toBe("2026-09-13");
  });
});
