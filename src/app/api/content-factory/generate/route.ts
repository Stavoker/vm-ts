import { NextResponse } from "next/server";
import { resolveBrand } from "@/lib/content-factory/brands";
import { generateContentPacks } from "@/lib/content-factory/openai";
import { parsePalette, withCustomPalette } from "@/lib/content-factory/palette";
import { parseGenerateRequest } from "@/lib/content-factory/post";
import { withSiteUrl } from "@/lib/content-factory/site-link";
import { createServerSupabase } from "@/lib/supabase";
import type { BrandPalette, BrandProfile, GeneratedPack } from "@/lib/content-factory/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SiteRow = {
  id: string;
  name: string;
  url: string;
  content_palette?: unknown;
};

function brandPayload(brand: BrandProfile) {
  return {
    slug: brand.slug,
    displayName: brand.displayName,
    palette: brand.palette,
    industry: brand.industry,
    siteId: brand.siteId,
    siteUrl: brand.siteUrl,
  };
}

function resolveSiteBrand(data: SiteRow, override?: BrandPalette): BrandProfile {
  const stored = parsePalette("content_palette" in data ? data.content_palette : null, `saved-${data.id}`);
  const palette = override || stored;
  let brand = resolveBrand({
    id: data.id,
    name: data.name,
    url: data.url,
  });
  if (palette) brand = withCustomPalette(brand, palette);
  return withSiteUrl(brand);
}

export async function POST(request: Request) {
  try {
    const payload = parseGenerateRequest(await request.json());
    const supabase = createServerSupabase();
    const first = await supabase
      .from("sites")
      .select("id, name, url, content_palette")
      .in("id", payload.siteIds);
    const lookup =
      first.error && /content_palette/i.test(first.error.message)
        ? await supabase.from("sites").select("id, name, url").in("id", payload.siteIds)
        : first;
    if (lookup.error) return NextResponse.json({ error: lookup.error.message }, { status: 500 });

    const byId = new Map(((lookup.data ?? []) as SiteRow[]).map((row) => [row.id, row]));
    const missing = payload.siteIds.filter((id) => !byId.has(id));
    if (missing.length) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    const projects: Array<{
      brand: ReturnType<typeof brandPayload>;
      packs: GeneratedPack[];
      post: GeneratedPack["post"] | null;
      images: GeneratedPack["images"];
      imageErrors: string[];
    }> = [];

    for (const siteId of payload.siteIds) {
      const data = byId.get(siteId)!;
      const brand = resolveSiteBrand(data, payload.palettes?.[siteId] || (siteId === payload.siteId ? payload.palette : undefined));
      const packs = await generateContentPacks({
        brand,
        topic: payload.topic,
        platform: payload.platform,
        language: payload.language,
        postCount: payload.postCount,
        imageCount: payload.imageCount,
      });
      const lead = packs[0];
      projects.push({
        brand: brandPayload(brand),
        packs,
        post: lead?.post ?? null,
        images: lead?.images ?? [],
        imageErrors: lead?.imageErrors ?? [],
      });
    }

    const leadProject = projects[0];

    return NextResponse.json({
      projects,
      brand: leadProject?.brand ?? null,
      packs: leadProject?.packs ?? [],
      post: leadProject?.post ?? null,
      images: leadProject?.images ?? [],
      imageErrors: leadProject?.imageErrors ?? [],
      topic: payload.topic,
      platform: payload.platform,
      language: payload.language,
      postCount: payload.postCount,
      imageCount: payload.imageCount,
      projectCount: projects.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сгенерировать";
    const status = message.includes("Выберите") || message.includes("тему") || message.includes("длинн") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
