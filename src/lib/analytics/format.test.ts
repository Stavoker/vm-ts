import { describe, expect, it } from "vitest";
import { formatDuration, formatPercent, formatUsd, parseRate } from "./format";

describe("analytics formatters", () => {
  it("formats duration as HH:MM:SS", () => {
    expect(formatDuration(272)).toBe("00:04:32");
  });

  it("formats rates as percents", () => {
    expect(formatPercent(0.174)).toBe("17.4%");
  });

  it("normalizes GA4 rates that arrive as 0-1 or 0-100", () => {
    expect(parseRate("0.174")).toBeCloseTo(0.174);
    expect(parseRate("17.4")).toBeCloseTo(0.174);
  });

  it("formats USD costs", () => {
    expect(formatUsd(0.33)).toBe("$0.33");
    expect(formatUsd(19.95)).toBe("$19.95");
  });
});
