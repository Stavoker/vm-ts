import { jsonError, jsonOk } from "@/lib/analytics/query";
import { generateWeeklyReport, getAnalyticsReport } from "@/lib/analytics/weekly-reports";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await getAnalyticsReport(id);
    const report = await generateWeeklyReport({
      siteId: existing.site_id,
      startDate: reportDate(existing.period_start),
      endDate: reportDate(existing.period_end),
      generatedBy: "manual",
      regenerate: true,
    });
    return jsonOk({ report });
  } catch (error) {
    return jsonError(error);
  }
}

function reportDate(value: string): string {
  return value.slice(0, 10);
}
