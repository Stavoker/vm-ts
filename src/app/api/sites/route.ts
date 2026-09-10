import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

function normalizeGa4PropertyId(raw: string | null | undefined): string | null {
  const value = raw?.trim() || "";
  if (!value) return null;
  const match = value.match(/^(?:properties\/)?(\d+)$/);
  if (!match) throw new Error("Invalid GA4 Property ID");
  return match[1];
}

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
      ga4_property_id?: string;
      ga4_measurement_id?: string;
      ga4_enabled?: boolean;
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
        ga4_property_id: normalizeGa4PropertyId(body.ga4_property_id),
        ga4_measurement_id: body.ga4_measurement_id?.trim() || null,
        ga4_enabled: Boolean(body.ga4_enabled && body.ga4_property_id?.trim()),
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
