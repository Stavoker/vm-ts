import { NextResponse } from "next/server";
import {
  getScanSession,
  listRequirementResults,
  listScanEvents,
} from "@/lib/requirements-check/sessions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getScanSession(id);
    if (!session) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    const [results, events] = await Promise.all([
      listRequirementResults(id),
      listScanEvents(id),
    ]);
    return NextResponse.json({ session, results, events });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load scan" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { createServerSupabase } = await import("@/lib/supabase");
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("requirement_check_sessions")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete scan" },
      { status: 500 },
    );
  }
}
