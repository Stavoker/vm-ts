import type { BrandPalette } from "./types";

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(HEX_RE);
  if (!match) return null;
  const value = match[1];
  if (value.length === 3) {
    const [r, g, b] = value.toUpperCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${value.toUpperCase()}`;
}

export function parsePalette(raw: unknown, id = "custom"): BrandPalette | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const primary = normalizeHex(input.primary);
  const secondary = normalizeHex(input.secondary);
  const accent = normalizeHex(input.accent);
  const background = normalizeHex(input.background);
  if (!primary || !secondary || !accent || !background) return null;
  return { id, primary, secondary, accent, background };
}

export function paletteColors(palette: BrandPalette): string[] {
  return [palette.primary, palette.secondary, palette.accent, palette.background];
}

export function withCustomPalette<T extends { palette: BrandPalette; imagery: string; avoid: string; slug?: string }>(
  brand: T,
  palette: BrandPalette,
): T {
  const colors = paletteColors(palette).join(", ");
  return {
    ...brand,
    palette: { ...palette, id: palette.id || `custom-${brand.slug || "brand"}` },
    imagery: `${brand.imagery} Use only these operator-set brand colors: ${colors}.`,
    avoid: `${brand.avoid}; любые цвета вне заданной палитры ${colors}`,
  };
}
