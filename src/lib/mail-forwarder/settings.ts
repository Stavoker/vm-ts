import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigError } from "@/lib/mail-forwarder/errors";
import type { ForwarderSettings, Mailbox } from "@/lib/mail-forwarder/types";

export const DEFAULT_ZOHO_ACCOUNTS_BASE_URL = "https://accounts.zoho.eu";
export const DEFAULT_ZOHO_MAIL_BASE_URL = "https://mail.zoho.eu";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SECRET_FILE_KEYS = ["refresh_token", "access_token", "client_secret", "password"];

export function env(name: string, fallback = ""): string {
  const value = process.env[name];
  if (value == null || !value.trim()) return fallback;
  return value.trim();
}

export function httpsOrigin(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be an https origin without credentials, path, or query`);
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new ConfigError(`${name} must be an https origin without credentials, path, or query`);
  }
  return value.replace(/\/$/, "");
}

export function zohoClientPair(refreshTokenEnv: string): { clientId: string | null; clientSecret: string | null } {
  const prefix = "ZOHO_REFRESH_TOKEN";
  if (!refreshTokenEnv.startsWith(prefix)) return { clientId: null, clientSecret: null };
  const suffix = refreshTokenEnv.slice(prefix.length);
  if (!suffix) return { clientId: null, clientSecret: null };
  const clientId = env(`ZOHO_CLIENT_ID${suffix}`);
  const clientSecret = env(`ZOHO_CLIENT_SECRET${suffix}`);
  if (clientId && clientSecret) return { clientId, clientSecret };
  return { clientId: null, clientSecret: null };
}

export function zohoBaseUrls(refreshTokenEnv: string): { accounts: string | null; mail: string | null } {
  const prefix = "ZOHO_REFRESH_TOKEN";
  if (!refreshTokenEnv.startsWith(prefix)) return { accounts: null, mail: null };
  const suffix = refreshTokenEnv.slice(prefix.length);
  if (!suffix) return { accounts: null, mail: null };
  const accounts = env(`ZOHO_ACCOUNTS_BASE_URL${suffix}`);
  const mail = env(`ZOHO_MAIL_BASE_URL${suffix}`);
  if (!accounts && !mail) return { accounts: null, mail: null };
  if (!accounts || !mail) {
    throw new ConfigError(
      `${refreshTokenEnv} needs both ZOHO_ACCOUNTS_BASE_URL${suffix} and ZOHO_MAIL_BASE_URL${suffix}`,
    );
  }
  return {
    accounts: httpsOrigin(accounts, `ZOHO_ACCOUNTS_BASE_URL${suffix}`),
    mail: httpsOrigin(mail, `ZOHO_MAIL_BASE_URL${suffix}`),
  };
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new ConfigError(`missing required environment variable ${name}`);
  return value;
}

function emailValue(value: string, name: string): string {
  if (!EMAIL_RE.test(value)) throw new ConfigError(`${name} must be an email address`);
  return value;
}

function boundedInt(raw: string, name: string, minimum: number, maximum?: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new ConfigError(`${name} must be an integer`);
  if (value < minimum || (maximum != null && value > maximum)) {
    const limit = maximum == null ? `at least ${minimum}` : `between ${minimum} and ${maximum}`;
    throw new ConfigError(`${name} must be ${limit}`);
  }
  return value;
}

function intEnv(name: string, fallback: number, minimum: number, maximum?: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  return boundedInt(raw, name, minimum, maximum);
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new ConfigError(`${name} must be true or false`);
}

export function loadForwarderSettings(): ForwarderSettings {
  const sendMethod = env("SEND_METHOD", "gmail").toLowerCase();
  if (sendMethod !== "gmail" && sendMethod !== "smtp") {
    throw new ConfigError("SEND_METHOD must be gmail or smtp");
  }

  const destination = emailValue(requireEnv("DESTINATION_EMAIL"), "DESTINATION_EMAIL");
  let senderEmail = destination;
  let gmailClientId: string | null = null;
  let gmailClientSecret: string | null = null;
  let gmailRefreshToken: string | null = null;
  let smtpHost: string | null = null;
  let smtpPort: number | null = null;
  let smtpUsername: string | null = null;
  let smtpPassword: string | null = null;

  if (sendMethod === "gmail") {
    gmailClientId = requireEnv("GMAIL_CLIENT_ID");
    gmailClientSecret = requireEnv("GMAIL_CLIENT_SECRET");
    gmailRefreshToken = requireEnv("GMAIL_REFRESH_TOKEN");
    const senderOverride = env("GMAIL_SENDER_EMAIL");
    senderEmail = senderOverride ? emailValue(senderOverride, "GMAIL_SENDER_EMAIL") : destination;
  } else {
    smtpHost = requireEnv("SMTP_HOST");
    smtpPort = boundedInt(requireEnv("SMTP_PORT"), "SMTP_PORT", 1, 65535);
    smtpUsername = emailValue(requireEnv("SMTP_USERNAME"), "SMTP_USERNAME");
    smtpPassword = requireEnv("SMTP_PASSWORD");
    senderEmail = smtpUsername;
    if (smtpPort !== 465 && smtpPort !== 587) {
      throw new ConfigError("SMTP_PORT must be 587 (STARTTLS) or 465 (implicit TLS)");
    }
  }

  const lookbackMinutesRaw = env("LOOKBACK_MINUTES");
  const lookbackMinutes = lookbackMinutesRaw
    ? boundedInt(lookbackMinutesRaw, "LOOKBACK_MINUTES", 1)
    : intEnv("LOOKBACK_HOURS", 24, 1) * 60;

  return {
    zohoClientId: env("ZOHO_CLIENT_ID"),
    zohoClientSecret: env("ZOHO_CLIENT_SECRET"),
    zohoAccountsBaseUrl: httpsOrigin(
      env("ZOHO_ACCOUNTS_BASE_URL", DEFAULT_ZOHO_ACCOUNTS_BASE_URL),
      "ZOHO_ACCOUNTS_BASE_URL",
    ),
    zohoMailBaseUrl: httpsOrigin(env("ZOHO_MAIL_BASE_URL", DEFAULT_ZOHO_MAIL_BASE_URL), "ZOHO_MAIL_BASE_URL"),
    destinationEmail: destination,
    sendMethod,
    senderEmail,
    gmailClientId,
    gmailClientSecret,
    gmailRefreshToken,
    smtpHost,
    smtpPort,
    smtpUsername,
    smtpPassword,
    pollIntervalSeconds: intEnv("POLL_INTERVAL_SECONDS", 60, 10),
    lookbackMinutes,
    initialImport: boolEnv("INITIAL_IMPORT", false),
    maxMessagesPerPoll: intEnv("MAX_MESSAGES_PER_POLL", 50, 1, 500),
    maxMessageBytes: intEnv("MAX_MESSAGE_BYTES", 20_000_000, 100_000, 25_000_000),
  };
}

export function tryLoadForwarderSettings():
  | { ok: true; settings: ForwarderSettings }
  | { ok: false; error: string } {
  try {
    return { ok: true, settings: loadForwarderSettings() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid mail-forwarder settings" };
  }
}

export function loadSeedMailboxes(): Mailbox[] {
  const rawJson = env("MAILBOXES_JSON");
  if (rawJson) {
    try {
      return parseMailboxPayload(JSON.parse(rawJson));
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      throw new ConfigError("MAILBOXES_JSON is not valid JSON");
    }
  }
  const configured = resolve(env("MAILBOXES_FILE", "config/mailboxes.json"));
  const bundled = resolve("config/mailboxes.json");
  const path = existsSync(configured) ? configured : existsSync(bundled) ? bundled : "";
  if (!path) return [];
  try {
    return parseMailboxPayload(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(`mailbox config file is not valid JSON: ${path}`);
  }
}

function parseMailboxPayload(payload: unknown): Mailbox[] {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new ConfigError("mailbox config must be a non-empty JSON array");
  }
  const mailboxes: Mailbox[] = [];
  const seen = new Set<string>();
  payload.forEach((item, index) => {
    if (!item || typeof item !== "object") throw new ConfigError(`mailbox entry ${index} must be an object`);
    const record = item as Record<string, unknown>;
    const leaked = SECRET_FILE_KEYS.filter((key) => key in record);
    if (leaked.length) {
      throw new ConfigError(
        `do not store secrets in the mailbox config; remove ${leaked.join(", ")} and use refresh_token_env`,
      );
    }
    const email = emailValue(String(record.email ?? "").trim(), `mailboxes[${index}].email`).toLowerCase();
    if (seen.has(email)) throw new ConfigError(`duplicate mailbox ${email}`);
    seen.add(email);
    const company = String(record.company ?? "").trim();
    const responsible = String(record.responsible ?? "").trim();
    if (!company || !responsible) throw new ConfigError(`mailbox ${email} needs company and responsible`);
    if (/[\r\n\0]/.test(company) || /[\r\n\0]/.test(responsible)) {
      throw new ConfigError(`mailbox ${email} has a newline in company or responsible`);
    }
    const enabled = record.enabled ?? true;
    if (typeof enabled !== "boolean") throw new ConfigError(`mailbox ${email} enabled must be true or false`);
    const tokenEnv = String(record.refresh_token_env || "ZOHO_REFRESH_TOKEN").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv)) {
      throw new ConfigError(`mailbox ${email} has an invalid refresh_token_env`);
    }
    const accountIdRaw = record.account_id;
    const accountId = accountIdRaw ? String(accountIdRaw).trim() : null;
    if (accountId && !/^[A-Za-z0-9]+$/.test(accountId)) {
      throw new ConfigError(`mailbox ${email} has an invalid account_id`);
    }
    const client = zohoClientPair(tokenEnv);
    const urls = zohoBaseUrls(tokenEnv);
    mailboxes.push({
      email,
      company,
      responsible,
      refreshToken: env(tokenEnv),
      refreshTokenEnv: tokenEnv,
      enabled,
      accountId,
      zohoClientId: client.clientId,
      zohoClientSecret: client.clientSecret,
      zohoAccountsBaseUrl: urls.accounts,
      zohoMailBaseUrl: urls.mail,
    });
  });
  return mailboxes;
}
