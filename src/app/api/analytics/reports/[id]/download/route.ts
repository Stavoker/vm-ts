import { NextResponse } from "next/server";
import { jsonError } from "@/lib/analytics/query";
import { getAnalyticsReport } from "@/lib/analytics/weekly-reports";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const report = await getAnalyticsReport(id);
    if (report.status !== "completed" || !report.pdf_base64) {
      return NextResponse.json({ error: "Report PDF is not available" }, { status: 409 });
    }
    const bytes = Buffer.from(report.pdf_base64, "base64");
    const fileName = report.file_name || `weekly-report-${report.period_start}.pdf`;
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
