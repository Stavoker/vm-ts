import { NextResponse } from "next/server";
import { cancelScan } from "@/lib/requirements-check/engine/runner";
import { setScanStatus } from "@/lib/requirements-check/sessions";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    cancelScan(id);
    await setScanStatus(id, "cancelled");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel scan" },
      { status: 500 },
    );
  }
}
