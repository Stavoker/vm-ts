import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("URL обязателен");
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);
  return url.toString().replace(/\/$/, "");
}

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("sites")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sites: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      url?: string;
      notes?: string;
    };

    if (!body.name?.trim() || !body.url?.trim()) {
      return NextResponse.json(
        { error: "Название и URL обязательны" },
        { status: 400 },
      );
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("sites")
      .insert({
        name: body.name.trim(),
        url: normalizeUrl(body.url),
        notes: body.notes?.trim() || null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ site: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
