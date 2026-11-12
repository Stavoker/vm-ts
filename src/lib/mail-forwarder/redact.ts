const ASSIGNMENT =
  /\b(refresh_token|access_token|client_secret|password|authorization|id_token|code)(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi;
const ZOHO = /(Zoho-oauthtoken\s+)\S+/gi;
const BEARER = /(Bearer\s+)\S+/gi;
const SECRET_KEY = /token|secret|password|authorization|credential/i;

export function redactText(value: string): string {
  return value.replace(ASSIGNMENT, "$1$2[REDACTED]").replace(ZOHO, "$1[REDACTED]").replace(BEARER, "$1[REDACTED]");
}

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

export function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (isSecretKey(key)) {
      next[key] = value ? "[stored]" : null;
      continue;
    }
    next[key] = typeof value === "string" ? redactText(value) : value;
  }
  return next;
}
