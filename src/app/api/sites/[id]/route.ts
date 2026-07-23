import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import type { SiteStatus } from "@/lib/types";

const STATUSES: SiteStatus[] = [
  "online",
  "offline",
  "payment_required",
  "blocked",
  "error",
];

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      notes?: string | null;
      is_active?: boolean;
      status?: SiteStatus;
      status_reason?: string | null;
    };

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if ("notes" in body) patch.notes = body.notes?.trim() || null;
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (body.status) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
      }
      patch.status = body.status;
      if ("status_reason" in body) {
        patch.status_reason = body.status_reason?.trim() || null;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("sites")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ site: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createServerSupabase();
    const { error } = await supabase.from("sites").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
