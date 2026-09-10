import { inclusiveDayCount } from "@/lib/analytics/timezone";
import { AnalyticsError } from "@/lib/analytics/errors";
import { jsonError, jsonOk } from "@/lib/analytics/query";
import { generateWeeklyReport, listAnalyticsReports } from "@/lib/analytics/weekly-reports";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get("siteId") || undefined;
    const reports = await listAnalyticsReports(siteId);
    return jsonOk({ reports });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      siteId?: string;
      startDate?: string;
      endDate?: string;
    };
    if (!body.siteId || !body.startDate || !body.endDate) {
      throw new AnalyticsError("invalid_query", "siteId, startDate and endDate are required", 400);
    }
    if (inclusiveDayCount(body.startDate, body.endDate) !== 7) {
      throw new AnalyticsError("invalid_query", "Weekly reports must cover exactly 7 days", 400);
    }
    const report = await generateWeeklyReport({
      siteId: body.siteId,
      startDate: body.startDate,
      endDate: body.endDate,
      generatedBy: "manual",
    });
    return jsonOk({ report }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
