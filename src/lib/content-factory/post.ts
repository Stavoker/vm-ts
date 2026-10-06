import { parsePalette } from "./palette";
import {
  CONTENT_LANGUAGES,
  CONTENT_PLATFORMS,
  type BrandPalette,
  type ContentLanguage,
  type ContentPlatform,
  type GenerateRequest,
  type GeneratedPost,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clampImageCount(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(6, Math.max(1, parsed));
}

export function clampPostCount(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(5, Math.max(1, parsed));
}

export function clampProjectCount(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(6, Math.max(1, parsed));
}

/** One Chat Completions call per project; images are separate OpenAI calls on the same key. */
export const MAX_BATCH_IMAGES = 12;

export function planBatch(input: {
  projectCount?: unknown;
  postCount?: unknown;
  imageCount?: unknown;
}): {
  projectCount: number;
  postCount: number;
  imageCount: number;
  totalImages: number;
  textCalls: number;
} {
  const projectCount = clampProjectCount(input.projectCount ?? 1);
  let postCount = clampPostCount(input.postCount);
  let imageCount = clampImageCount(input.imageCount);
  while (projectCount * postCount * imageCount > MAX_BATCH_IMAGES && (postCount > 1 || imageCount > 1)) {
    if (imageCount > 1) imageCount -= 1;
    else postCount -= 1;
  }
  return {
    projectCount,
    postCount,
    imageCount,
    totalImages: projectCount * postCount * imageCount,
    textCalls: projectCount,
  };
}

export function parseSiteIds(body: Record<string, unknown>): string[] {
  const fromArray = Array.isArray(body.siteIds) ? body.siteIds : [];
  const extra = typeof body.siteId === "string" ? [body.siteId] : [];
  const ids = [...fromArray, ...extra]
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => UUID_RE.test(item));
  return [...new Set(ids)].slice(0, 6);
}

export function normalizeHashtag(tag: string): string {
  const cleaned = tag.trim().replace(/^#+/, "").replace(/\s+/g, "");
  if (!cleaned) return "";
  return `#${cleaned}`;
}

export function composeFullPost(parts: {
  hook: string;
  body: string;
  disclaimer: string;
  cta: string;
  hashtags: string[];
}): string {
  const hashtags = parts.hashtags.map(normalizeHashtag).filter(Boolean);
  return [parts.hook, parts.body, parts.disclaimer, parts.cta, hashtags.join(" ")]
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function parseGenerateRequest(body: unknown): GenerateRequest {
  const input = (body ?? {}) as Record<string, unknown>;
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  const platformRaw = typeof input.platform === "string" ? input.platform : "instagram";
  const languageRaw = typeof input.language === "string" ? input.language : "en";
  const platform = CONTENT_PLATFORMS.includes(platformRaw as ContentPlatform)
    ? (platformRaw as ContentPlatform)
    : "instagram";
  const language = CONTENT_LANGUAGES.includes(languageRaw as ContentLanguage)
    ? (languageRaw as ContentLanguage)
    : "en";

  const siteIds = parseSiteIds(input);
  if (siteIds.length === 0) {
    throw new Error("Выберите проект");
  }
  if (topic.length < 3) {
    throw new Error("Опишите тему поста");
  }
  if (topic.length > 500) {
    throw new Error("Тема слишком длинная");
  }

  const planned = planBatch({
    projectCount: siteIds.length,
    postCount: input.postCount,
    imageCount: input.imageCount,
  });
  const palettesRaw = input.palettes && typeof input.palettes === "object" ? (input.palettes as Record<string, unknown>) : {};
  const palettes: Record<string, BrandPalette> = {};
  for (const id of siteIds) {
    const parsed = parsePalette(palettesRaw[id] ?? (id === siteIds[0] ? input.palette : null));
    if (parsed) palettes[id] = parsed;
  }

  return {
    siteId: siteIds[0],
    siteIds,
    topic,
    imageCount: planned.imageCount,
    postCount: planned.postCount,
    platform,
    language,
    palettes,
    palette: palettes[siteIds[0]],
  };
}

export function normalizeGeneratedPost(raw: Partial<GeneratedPost> | null | undefined, fallbackCta: string, fallbackDisclaimer: string): GeneratedPost {
  const hook = raw?.hook?.trim() || "";
  const body = raw?.body?.trim() || "";
  const disclaimer = raw?.disclaimer?.trim() || fallbackDisclaimer;
  const cta = raw?.cta?.trim() || fallbackCta;
  const hashtags = Array.isArray(raw?.hashtags)
    ? raw.hashtags.filter((item): item is string => typeof item === "string").map(normalizeHashtag).filter(Boolean)
    : [];
  const fullPost =
    raw?.fullPost?.trim() ||
    composeFullPost({ hook, body, disclaimer, cta, hashtags });
  return { hook, body, disclaimer, cta, hashtags, fullPost };
}
