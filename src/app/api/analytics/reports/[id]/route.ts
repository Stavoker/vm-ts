import { jsonError, jsonOk } from "@/lib/analytics/query";
import { getAnalyticsReport } from "@/lib/analytics/weekly-reports";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const report = await getAnalyticsReport(id);
    return jsonOk({
      report: {
        ...report,
        pdf_base64: undefined,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
