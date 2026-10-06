import { NextResponse } from "next/server";
import { publicBrand, resolveBrand } from "@/lib/content-factory/brands";
import { parsePalette, withCustomPalette } from "@/lib/content-factory/palette";
import { createServerSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const first = await supabase.from("sites").select("id, name, url, content_palette").order("name");
    const result =
      first.error && /content_palette/i.test(first.error.message)
        ? await supabase.from("sites").select("id, name, url").order("name")
        : first;
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    const brands = (result.data ?? []).map((row) => {
      const base = resolveBrand({ id: row.id as string, name: row.name as string, url: row.url as string });
      const saved = parsePalette(
        "content_palette" in row ? row.content_palette : null,
        `saved-${row.id}`,
      );
      return publicBrand(saved ? withCustomPalette(base, saved) : base);
    });
    return NextResponse.json({ brands });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
