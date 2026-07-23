import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("site_checks")
      .select("*")
      .eq("site_id", id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ checks: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
