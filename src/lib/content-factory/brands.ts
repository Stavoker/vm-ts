import { hostnameFromUrl } from "@/lib/analytics/timezone";
import { withSiteUrl } from "./site-link";
import type { BrandPalette, BrandProfile } from "./types";

const PALETTES: BrandPalette[] = [
  { id: "navy-gold", primary: "#0B1F3A", secondary: "#C9A227", accent: "#F4E4B2", background: "#F7F3EA" },
  { id: "coral-ink", primary: "#1A1412", secondary: "#E85D4C", accent: "#F6C6A8", background: "#FFF6F1" },
  { id: "forest-sand", primary: "#14342B", secondary: "#C4A574", accent: "#E7D7C1", background: "#F4EFE6" },
  { id: "violet-cyan", primary: "#12081F", secondary: "#7C5CFF", accent: "#5CE1E6", background: "#F3F0FF" },
  { id: "steel-amber", primary: "#1C2430", secondary: "#F0A202", accent: "#E8EEF5", background: "#F5F7FA" },
  { id: "wine-cream", primary: "#4A1C2F", secondary: "#E3C7A6", accent: "#F3E6D8", background: "#FFF9F4" },
];

type KnownBrand = Omit<BrandProfile, "siteId" | "siteUrl" | "domain" | "known" | "displayName"> & {
  aliases: string[];
  displayName: string;
};

const KNOWN: KnownBrand[] = [
  {
    slug: "horizon-skill",
    displayName: "Horizon Skill",
    aliases: ["horizon skill", "horizon-skill", "horizonskill"],
    industry: "онлайн-навыки и обучение",
    voice: "уверенный наставник: ясно, спокойно, без хайпа. Короткие фразы про прогресс и практику.",
    palette: PALETTES[0],
    imagery:
      "cinematic study scenes, wide horizon light, oak desk, navy and gold, adult learners, no classrooms of children, premium editorial photography, generous negative space",
    avoid: "детские классы, клипарт, неоновые геймерские цвета, чужие логотипы, мелкий нечитаемый текст",
    disclaimer: "Образовательный контент. Результат зависит от вашей практики. Не является аккредитованной степенью.",
    cta: "Начните учиться на Horizon Skill →",
    emojiGuide: "✨ 📈 🧭 🌅 — умеренно, 2–4 на пост",
    hashtagSeeds: ["#HorizonSkill", "#LearnByDoing", "#SkillUp"],
  },
  {
    slug: "playworldhub",
    displayName: "Playworldhub",
    aliases: ["playworldhub", "playworld", "pwh"],
    industry: "развлекательная игровая платформа",
    voice: "энергичный, дружелюбный, без токсичности. Игра как отдых, не как обещание выигрыша.",
    palette: PALETTES[1],
    imagery:
      "playful isometric worlds, rounded shapes, coral and cream, joyful adult hobby scenes, soft studio lighting, no weapons, no gambling tables",
    avoid: "казино, слоты, кровь, реалистичное оружие, логотипы консолей и чужих игр",
    disclaimer: "Развлечение 18+. Играйте ответственно. Это не азартные ставки и не способ заработка.",
    cta: "Откройте Playworldhub →",
    emojiGuide: "🎮 ✨ 🚀 😄 — ярко, но без спама",
    hashtagSeeds: ["#Playworldhub", "#PlayTime", "#GameNight"],
  },
  {
    slug: "avelnix",
    displayName: "Avelnix",
    aliases: ["avelnix"],
    industry: "AI / SaaS платформа",
    voice: "точно, современно, без пустых обещаний ИИ. Человек остаётся автором.",
    palette: PALETTES[3],
    imagery:
      "dark studio product shots, translucent glass UI, violet and cyan light streaks, abstract neural forms, no human faces unless silhouette",
    avoid: "роботы-человечки, зелёные Matrix-глифы, стоковые рукопожатия, чужие AI-логотипы",
    disclaimer: "ИИ помогает с черновиком. Проверяйте факты перед публикацией. Не финансовый и не юридический совет.",
    cta: "Попробуйте Avelnix →",
    emojiGuide: "⚡ 🧠 ✨ — 1–3, технологично",
    hashtagSeeds: ["#Avelnix", "#AITools", "#BuildWithAI"],
  },
  {
    slug: "spinveld",
    displayName: "Spinveld",
    aliases: ["spinveld"],
    industry: "цифровой сервис / бренд движения",
    voice: "динамика и контроль: коротко, премиально, без крика.",
    palette: PALETTES[4],
    imagery:
      "kinetic motion blur, steel blue and amber sparks, architectural wind fields, premium sports-adjacent stills without teams or betting slips",
    avoid: "рулетка, слоты, логотипы команд, сигареты, агрессивный красный «джекпот»",
    disclaimer: "Информация о сервисе. Уточняйте актуальные условия на сайте. 18+ при необходимости.",
    cta: "Смотрите Spinveld →",
    emojiGuide: "🌪️ ⚡ ✨ — сдержанно",
    hashtagSeeds: ["#Spinveld", "#InMotion", "#StaySharp"],
  },
  {
    slug: "pixora",
    displayName: "Pixora",
    aliases: ["pixora"],
    industry: "визуальный креатив / дизайн",
    voice: "эстет, коротко про картинку и вкус. Без канцелярита.",
    palette: PALETTES[5],
    imagery:
      "bold art-direction stills, wine and cream, tactile paper and print textures, gallery lighting, original compositions",
    avoid: "Canva-шаблоны, водяные знаки стоков, чужие шрифтовые логотипы",
    disclaimer: "Визуал создан для бренда. Перед публикацией проверьте права на любые сторонние материалы.",
    cta: "Соберите визуал в Pixora →",
    emojiGuide: "🎨 📷 ✨ — мало и точно",
    hashtagSeeds: ["#Pixora", "#VisualIdentity", "#ArtDirection"],
  },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function haystack(name: string, url: string): string {
  return `${name} ${hostnameFromUrl(url)}`.toLowerCase();
}

export function findKnownBrand(name: string, url: string): KnownBrand | null {
  const hay = haystack(name, url);
  for (const brand of KNOWN) {
    if (brand.aliases.some((alias) => hay.includes(alias))) return brand;
  }
  return null;
}

export function resolveBrand(site: { id: string; name: string; url: string }): BrandProfile {
  const domain = hostnameFromUrl(site.url);
  const known = findKnownBrand(site.name, site.url);
  if (known) {
    const { aliases, ...rest } = known;
    void aliases;
    return withSiteUrl({
      ...rest,
      siteId: site.id,
      siteUrl: site.url,
      domain,
      known: true,
      displayName: site.name || known.displayName,
    });
  }

  const palette = PALETTES[hashString(domain || site.name) % PALETTES.length];
  return withSiteUrl({
    slug: (domain || site.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project",
    displayName: site.name,
    siteId: site.id,
    siteUrl: site.url,
    domain,
    known: false,
    industry: "цифровой продукт",
    voice: "премиальный, конкретный, без шаблонного маркетинга. Уникальный тон под этот домен.",
    palette,
    imagery: `distinct brand photography using only ${palette.primary}, ${palette.secondary} and ${palette.accent}, original compositions, no generic stock smiles`,
    avoid: "чужие логотипы, водяные знаки, нечитаемый мелкий текст, повторяющиеся шаблонные сцены",
    disclaimer: "Информация о сервисе. Актуальные условия — на сайте. Не является офертой.",
    cta: `Подробнее →`,
    emojiGuide: "✨ 🔗 — 2–4 уместных эмодзи",
    hashtagSeeds: [`#${site.name.replace(/\s+/g, "")}`, "#DigitalProduct"],
  });
}

export function publicBrand(brand: BrandProfile) {
  return {
    slug: brand.slug,
    displayName: brand.displayName,
    siteId: brand.siteId,
    siteUrl: brand.siteUrl,
    domain: brand.domain,
    known: brand.known,
    industry: brand.industry,
    voice: brand.voice,
    palette: brand.palette,
    disclaimer: brand.disclaimer,
    cta: brand.cta,
    emojiGuide: brand.emojiGuide,
    hashtagSeeds: brand.hashtagSeeds,
  };
}
