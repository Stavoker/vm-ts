const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b0{6,}\b/, label: "zero-filled registration number" },
  { pattern: /\b(x{3,}|xxx+)\b/i, label: "masked placeholder text" },
  { pattern: /\b(tbd|n\/a|coming soon|under construction)\b/i, label: "incomplete content marker" },
  { pattern: /\blorem ipsum\b/i, label: "lorem ipsum filler" },
  { pattern: /\b(your company|company name here|example\.com|test@test)\b/i, label: "template placeholder" },
  { pattern: /\b(john doe|jane doe)\b/i, label: "generic person name" },
  { pattern: /\b\+?0{7,}\b/, label: "zero-filled phone number" },
];

export function detectPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const item of PLACEHOLDER_PATTERNS) {
    if (item.pattern.test(text)) found.add(item.label);
  }
  return [...found];
}

export function hasPlaceholderRegistrationNumber(text: string): boolean {
  return /\breg\.?\s*(?:no|number|#)?\s*[:\.]?\s*0{5,}\b/i.test(text);
}
