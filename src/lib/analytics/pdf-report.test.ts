import { describe, expect, it } from "vitest";
import { emptyOverview } from "./aggregate";
import { generateWeeklyPdf, weeklyPdfFilename } from "./pdf-report";
import { buildTrafficCostSummary } from "./traffic-cost";
import type { BreakdownRow, WeeklyReportData } from "./types";

function row(label: string, sessions: number): BreakdownRow {
  return {
    keys: { country: label },
    label,
    activeUsers: sessions,
    totalUsers: sessions,
    sessions,
    pageViews: sessions * 2,
    engagedSessions: Math.round(sessions * 0.8),
    bounceRate: 0.2,
    engagementRate: 0.8,
    sessionsShare: 0.5,
    usersShare: 0.5,
  };
}

describe("weekly pdf report", () => {
  it("names the file in Russian", () => {
    expect(weeklyPdfFilename({ name: "Shop", url: "https://shop.example.com" }, "2026-09-01", "2026-09-07")).toBe(
      "shop_example_com_ezhenedelnyy_otchet_2026-09-01_2026-09-07.pdf",
    );
  });

  it("renders a PDF with Russian traffic-cost content", async () => {
    const current = {
      ...emptyOverview(),
      totalUsers: 8000,
      newUsers: 5000,
      sessions: 12000,
      pageViews: 24000,
      bounceRate: 0.18,
      engagementRate: 0.82,
      viewsPerSession: 2,
      averageEngagementTime: 90,
    };
    const data: WeeklyReportData = {
      site: {
        id: "site-1",
        name: "Demo Shop",
        url: "https://shop.example.com",
        domain: "shop.example.com",
        ga4_property_id: "123",
        ga4_measurement_id: null,
        ga4_enabled: true,
      },
      periodStart: "2026-09-01",
      periodEnd: "2026-09-07",
      previousStart: "2026-08-25",
      previousEnd: "2026-08-31",
      generatedAt: "2026-09-11T12:00:00.000Z",
      timezone: "Europe/Kyiv",
      current,
      previous: { ...emptyOverview(), sessions: 10000, totalUsers: 7000, bounceRate: 0.21, engagementRate: 0.79 },
      daily: [
        { key: "2026-09-01", label: "Mon", activeUsers: 1000, newUsers: 600, sessions: 1500, pageViews: 3000, bounceRate: 0.2, engagementRate: 0.8 },
        { key: "2026-09-02", label: "Tue", activeUsers: 1100, newUsers: 700, sessions: 1700, pageViews: 3400, bounceRate: 0.18, engagementRate: 0.82 },
      ],
      countries: [
        row("United Kingdom", 3403),
        row("Greece", 2038),
        row("France", 682),
        row("Cyprus", 646),
        row("United States", 4),
        row("Portugal", 2),
        row("Poland", 1),
      ],
      devices: [row("mobile", 7000), row("desktop", 5000)],
      sources: [row("google / organic", 8000)],
      campaigns: [],
      landingPages: [row("/", 5000)],
      insights: ["Сессии выросли на 20.0% по сравнению с прошлой неделей."],
      trafficCost: buildTrafficCostSummary({ packVisits: 600_000, sessions: 12000, users: 8000, previousSessions: 10000, previousUsers: 7000 }),
    };

    const pdf = await generateWeeklyPdf(data);
    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(20_000);
  });
});
