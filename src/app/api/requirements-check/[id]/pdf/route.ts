import { NextResponse } from "next/server";
import { generateRequirementsPdf, pdfFilename } from "@/lib/requirements-check/pdf/report";
import {
  getScanSession,
  listRequirementResults,
} from "@/lib/requirements-check/sessions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getScanSession(id);
    if (!session) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    const results = await listRequirementResults(id);
    const pdf = await generateRequirementsPdf({ session, results });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFilename(session)}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
