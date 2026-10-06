export const CONTENT_PLATFORMS = ["instagram", "facebook", "linkedin", "x"] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

export const CONTENT_LANGUAGES = ["en", "ru"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

export type BrandPalette = {
  id: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
};

export type BrandProfile = {
  slug: string;
  displayName: string;
  siteId?: string;
  siteUrl: string;
  domain: string;
  known: boolean;
  industry: string;
  voice: string;
  palette: BrandPalette;
  imagery: string;
  avoid: string;
  disclaimer: string;
  cta: string;
  emojiGuide: string;
  hashtagSeeds: string[];
};

export type GeneratedPost = {
  hook: string;
  body: string;
  disclaimer: string;
  cta: string;
  hashtags: string[];
  fullPost: string;
  visualAngle?: string;
};

export type GeneratedImage = {
  index: number;
  mimeType: string;
  dataUrl: string;
};

export type GenerateRequest = {
  siteId: string;
  siteIds: string[];
  topic: string;
  imageCount: number;
  postCount: number;
  platform: ContentPlatform;
  language: ContentLanguage;
  palettes?: Record<string, BrandPalette>;
  palette?: BrandPalette;
};

export type GeneratedPack = {
  post: GeneratedPost;
  images: GeneratedImage[];
  imageErrors: string[];
};
