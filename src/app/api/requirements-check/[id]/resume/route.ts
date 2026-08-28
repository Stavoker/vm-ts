import { NextResponse } from "next/server";
import { resumeScan } from "@/lib/requirements-check/engine/runner";
import { setScanStatus } from "@/lib/requirements-check/sessions";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    resumeScan(id);
    await setScanStatus(id, "running");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resume scan" },
      { status: 500 },
    );
  }
}
