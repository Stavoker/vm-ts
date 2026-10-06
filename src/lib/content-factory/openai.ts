import { resolveOpenAiTextModel } from "@/lib/requirements-check/external/openai-cost";
import type { BrandProfile } from "./types";
import { normalizeGeneratedPost } from "./post";
import { canonicalSiteUrl, ensurePostContainsSiteUrl } from "./site-link";
import type { ContentLanguage, ContentPlatform, GeneratedImage, GeneratedPost } from "./types";

const PLATFORM_HINT: Record<ContentPlatform, string> = {
  instagram: "Instagram caption. 120–180 words. Line breaks. Emojis in the hook and body.",
  facebook: "Facebook post. 90–160 words. Conversational, still branded.",
  linkedin: "LinkedIn post. 80–140 words. Fewer emojis, still include 1–2. Professional but human.",
  x: "X/Twitter post. Hard cap 260 characters for hook+body combined. Disclaimer and CTA stay short. Hashtags max 3.",
};

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY не настроен");
  return key;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Модель вернула не JSON");
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

export async function generatePostCopy(input: {
  brand: BrandProfile;
  topic: string;
  platform: ContentPlatform;
  language: ContentLanguage;
  postCount?: number;
}): Promise<GeneratedPost[]> {
  const apiKey = requireApiKey();
  const model = resolveOpenAiTextModel();
  const postCount = Math.min(5, Math.max(1, input.postCount ?? 1));
  const languageLine =
    input.language === "ru"
      ? "Write ALL user-facing strings in Russian."
      : "Write ALL user-facing strings in English.";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You write social posts for one brand only. Never mix another project's identity.",
            `Return JSON: { "posts": [ ... exactly ${postCount} objects ... ] }.`,
            "Each object keys: hook, body, disclaimer, cta, hashtags (array of 4 to 8), fullPost, visualAngle.",
            "visualAngle: one short English scene for matching images (no other brand names).",
            "Posts must differ in hook, angle and examples — not paraphrases of each other.",
            "hook: 1 punchy line with 1–2 emojis.",
            "body: value + specifics for the topic. Include 3–6 emojis total across hook+body.",
            "disclaimer: required, adapted to the topic but keep the brand legal tone.",
            "cta: one line with a verb, then the EXACT website URL, then an arrow.",
            "The official website URL must appear in the CTA and in fullPost. Never invent a different domain.",
            "hashtags: mix brand seeds and topic tags. Include #.",
            "fullPost: ready to paste: hook, blank line, body, blank line, disclaimer, blank line, cta, blank line, hashtags.",
            languageLine,
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            brand: {
              name: input.brand.displayName,
              websiteUrl: canonicalSiteUrl(input.brand.siteUrl),
              url: canonicalSiteUrl(input.brand.siteUrl),
              industry: input.brand.industry,
              voice: input.brand.voice,
              palette: input.brand.palette,
              emojiGuide: input.brand.emojiGuide,
              hashtagSeeds: input.brand.hashtagSeeds,
              disclaimer: input.brand.disclaimer,
              cta: input.brand.cta,
            },
            topic: input.topic,
            postCount,
            platform: PLATFORM_HINT[input.platform],
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI HTTP ${response.status}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Пустой ответ модели");
  const parsed = extractJsonObject(content);
  const rawPosts = Array.isArray(parsed.posts) ? parsed.posts : [parsed];
  const posts = rawPosts.slice(0, postCount).map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const hashtags = Array.isArray(raw.hashtags)
      ? raw.hashtags.filter((tag): tag is string => typeof tag === "string")
      : [];
    const visualAngle = typeof raw.visualAngle === "string" ? raw.visualAngle.trim() : "";
    const post = ensurePostContainsSiteUrl(
      normalizeGeneratedPost(
        {
          hook: typeof raw.hook === "string" ? raw.hook : "",
          body: typeof raw.body === "string" ? raw.body : "",
          disclaimer: typeof raw.disclaimer === "string" ? raw.disclaimer : "",
          cta: typeof raw.cta === "string" ? raw.cta : "",
          hashtags,
          fullPost: typeof raw.fullPost === "string" ? raw.fullPost : "",
        },
        input.brand.cta,
        input.brand.disclaimer,
      ),
      input.brand.siteUrl,
    );
    return visualAngle ? { ...post, visualAngle } : post;
  });
  while (posts.length < postCount && posts[0]) posts.push(posts[0]);
  if (posts.length === 0) throw new Error("Модель не вернула посты");
  return posts;
}

const VARIATION: string[] = [
  "hero scene, product or world as the main subject, lots of negative space",
  "close tactile detail / texture that still reads as the same brand",
  "lifestyle moment of an adult using the product, faces optional and not celebrity-like",
  "abstract brand graphic with the palette shapes, almost poster-like",
  "editorial still-life flat lay matching the industry",
  "end-card composition with a simple 2-word headline in the brand colors, large type, high contrast",
];

export function imagePrompt(
  brand: BrandProfile,
  topic: string,
  index: number,
  total: number,
  scene?: string,
): string {
  const variation = VARIATION[index] || VARIATION[0];
  const website = canonicalSiteUrl(brand.siteUrl);
  return [
    `Branded social square 1024x1024 for ${brand.displayName}.`,
    `Official website URL (include this exact URL if any link or domain appears in the image): ${website}.`,
    `Industry: ${brand.industry}.`,
    `Visual identity: ${brand.imagery}.`,
    scene ? `This set belongs to caption angle: ${scene}.` : "",
    `Palette only, operator-set: ${brand.palette.primary}, ${brand.palette.secondary}, ${brand.palette.accent}, background ${brand.palette.background}. Do not invent other hues.`,
    `Topic: ${topic}.`,
    `Frame ${index + 1} of ${total}: ${variation}.`,
    `Avoid: ${brand.avoid}. No watermarks, no other brand names or other websites, no photorealistic logos of third parties, no unreadable micro text.`,
  ]
    .filter(Boolean)
    .join(" ");
}

async function generateOneImage(apiKey: string, prompt: string, index: number): Promise<GeneratedImage> {
  const model = process.env.OPENAI_IMAGE_MODEL || "dall-e-3";
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: "1024x1024",
      ...(model.startsWith("dall-e") ? { response_format: "b64_json" } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `Image HTTP ${response.status}`);
  }
  const b64 = data.data?.[0]?.b64_json;
  if (b64) {
    return { index, mimeType: "image/png", dataUrl: `data:image/png;base64,${b64}` };
  }
  const url = data.data?.[0]?.url;
  if (!url) throw new Error("Изображение не вернулось");
  const imageRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!imageRes.ok) throw new Error("Не удалось скачать изображение");
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  return { index, mimeType: "image/png", dataUrl: `data:image/png;base64,${buffer.toString("base64")}` };
}

export async function generateBrandImages(input: {
  brand: BrandProfile;
  topic: string;
  count: number;
  scene?: string;
}): Promise<{ images: GeneratedImage[]; errors: string[] }> {
  const apiKey = requireApiKey();
  const images: GeneratedImage[] = [];
  const errors: string[] = [];
  const prompts = Array.from({ length: input.count }, (_, index) =>
    imagePrompt(input.brand, input.topic, index, input.count, input.scene),
  );

  const concurrency = 2;
  let cursor = 0;
  async function worker() {
    while (cursor < prompts.length) {
      const index = cursor;
      cursor += 1;
      try {
        images.push(await generateOneImage(apiKey, prompts[index], index));
      } catch (error) {
        errors.push(
          `Картинка ${index + 1}: ${error instanceof Error ? error.message : "ошибка генерации"}`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, prompts.length) }, () => worker()));
  images.sort((a, b) => a.index - b.index);
  return { images, errors };
}

export async function generateContentPacks(input: {
  brand: BrandProfile;
  topic: string;
  platform: ContentPlatform;
  language: ContentLanguage;
  postCount: number;
  imageCount: number;
}): Promise<Array<{ post: GeneratedPost; images: GeneratedImage[]; imageErrors: string[] }>> {
  const posts = await generatePostCopy({
    brand: input.brand,
    topic: input.topic,
    platform: input.platform,
    language: input.language,
    postCount: input.postCount,
  });
  const apiKey = requireApiKey();
  const packs = posts.map((post) => ({
    post,
    images: [] as GeneratedImage[],
    imageErrors: [] as string[],
  }));
  if (input.imageCount < 1) return packs;

  type Job = { packIndex: number; imageIndex: number; prompt: string };
  const jobs: Job[] = posts.flatMap((post, packIndex) =>
    Array.from({ length: input.imageCount }, (_, imageIndex) => ({
      packIndex,
      imageIndex,
      prompt: imagePrompt(
        input.brand,
        input.topic,
        imageIndex,
        input.imageCount,
        post.visualAngle || post.hook,
      ),
    })),
  );

  const concurrency = 2;
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      try {
        const image = await generateOneImage(apiKey, job.prompt, job.imageIndex);
        packs[job.packIndex].images.push(image);
      } catch (error) {
        packs[job.packIndex].imageErrors.push(
          `Картинка ${job.imageIndex + 1}: ${error instanceof Error ? error.message : "ошибка генерации"}`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  for (const pack of packs) pack.images.sort((a, b) => a.index - b.index);
  return packs;
}
