import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { ConfigError } from "@/lib/mail-forwarder/errors";
import { Mutex } from "@/lib/mail-forwarder/mutex";
import { env, httpsOrigin, zohoBaseUrls, zohoClientPair } from "@/lib/mail-forwarder/settings";
import type { Mailbox, MailboxView, MessageSummary } from "@/lib/mail-forwarder/types";
import { FORWARDER_TABLES, type ForwarderTableName } from "@/lib/mail-forwarder/types";
import { redactText, sanitizeRow } from "@/lib/mail-forwarder/redact";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mailboxes (
    email TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    responsible TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    refresh_token_env TEXT,
    refresh_token TEXT,
    zoho_client_id TEXT,
    zoho_client_secret TEXT,
    account_id TEXT,
    zoho_accounts_base_url TEXT,
    zoho_mail_base_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS processed_messages (
    mailbox_email TEXT NOT NULL,
    zoho_message_id TEXT NOT NULL,
    original_message_id TEXT,
    subject TEXT,
    provider_message_id TEXT,
    forwarded_at TEXT NOT NULL,
    PRIMARY KEY (mailbox_email, zoho_message_id)
);
CREATE TABLE IF NOT EXISTS forward_attempts (
    mailbox_email TEXT NOT NULL,
    zoho_message_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    subject TEXT,
    from_address TEXT,
    to_address TEXT,
    received_time_ms INTEGER,
    has_attachment INTEGER NOT NULL DEFAULT 0,
    has_inline INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    last_attempt_at TEXT NOT NULL,
    PRIMARY KEY (mailbox_email, zoho_message_id)
);
CREATE TABLE IF NOT EXISTS mailbox_sync (
    mailbox_email TEXT PRIMARY KEY,
    initial_import_done INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS forwarder_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function clip(value: string | null | undefined, limit: number): string | null {
  if (value == null) return null;
  return value.replace(/[\r\n\0]/g, " ").slice(0, limit);
}

function asRecord(row: unknown): Record<string, unknown> {
  return { ...(row as Record<string, unknown>) };
}

function optionalZohoUrls(accounts: string, mail: string): { accounts: string | null; mail: string | null } {
  const accountsUrl = accounts.trim();
  const mailUrl = mail.trim();
  if (!accountsUrl && !mailUrl) return { accounts: null, mail: null };
  if (!accountsUrl || !mailUrl) {
    throw new ConfigError("Zoho accounts URL and mail URL must both be set, or both left blank");
  }
  return {
    accounts: httpsOrigin(accountsUrl, "Zoho accounts URL"),
    mail: httpsOrigin(mailUrl, "Zoho mail URL"),
  };
}

function validateMailboxFields(input: {
  email: string;
  company: string;
  responsible: string;
  refreshTokenEnv: string;
  accountId?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const company = input.company.trim();
  const responsible = input.responsible.trim();
  const refreshTokenEnv = (input.refreshTokenEnv || "ZOHO_REFRESH_TOKEN").trim();
  if (!EMAIL_RE.test(email)) throw new ConfigError("email must be an email address");
  if (!company || !responsible) throw new ConfigError("company and responsible are required");
  if (/[\r\n\0]/.test(company) || /[\r\n\0]/.test(responsible)) {
    throw new ConfigError("company and responsible cannot contain newlines");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(refreshTokenEnv)) {
    throw new ConfigError("refresh_token_env must be an environment variable name");
  }
  const accountId = input.accountId?.trim() || null;
  if (accountId && !/^[A-Za-z0-9]+$/.test(accountId)) {
    throw new ConfigError("account_id contains unsupported characters");
  }
  return { email, company, responsible, refreshTokenEnv, accountId };
}

export class ForwarderDatabase {
  private readonly conn: BetterSqlite3.Database;
  private readonly mutex = new Mutex();

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.conn = new BetterSqlite3(path);
    this.conn.exec("PRAGMA journal_mode=WAL");
    this.conn.exec("PRAGMA busy_timeout=5000");
    this.conn.exec(SCHEMA);
    this.ensureColumns();
  }

  close(): void {
    this.conn.close();
  }

  private ensureColumns(): void {
    const rows = this.conn.prepare("PRAGMA table_info(mailboxes)").all() as Array<{ name: string }>;
    const existing = new Set(rows.map((row) => row.name));
    if (!existing.has("zoho_accounts_base_url")) this.conn.exec("ALTER TABLE mailboxes ADD COLUMN zoho_accounts_base_url TEXT");
    if (!existing.has("zoho_mail_base_url")) this.conn.exec("ALTER TABLE mailboxes ADD COLUMN zoho_mail_base_url TEXT");
    if (!existing.has("zoho_client_id")) this.conn.exec("ALTER TABLE mailboxes ADD COLUMN zoho_client_id TEXT");
    if (!existing.has("zoho_client_secret")) this.conn.exec("ALTER TABLE mailboxes ADD COLUMN zoho_client_secret TEXT");
  }

  private run<T>(fn: () => T): Promise<T> {
    return this.mutex.run(fn);
  }

  seedMailboxesIfEmpty(mailboxes: Mailbox[]): Promise<number> {
    return this.run(() => {
      const countRow = this.conn.prepare("SELECT COUNT(*) AS n FROM mailboxes").get() as { n: number };
      if (countRow.n) return 0;
      const now = utcNow();
      const insert = this.conn.prepare(`
        INSERT INTO mailboxes (
          email, company, responsible, enabled, refresh_token_env,
          refresh_token, account_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
      `);
      for (const mailbox of mailboxes) {
        insert.run(
          mailbox.email.toLowerCase(),
          mailbox.company,
          mailbox.responsible,
          mailbox.enabled ? 1 : 0,
          mailbox.refreshTokenEnv,
          mailbox.accountId,
          now,
          now,
        );
      }
      return mailboxes.length;
    });
  }

  saveZohoUrls(email: string, accountsBaseUrl: string, mailBaseUrl: string): Promise<void> {
    return this.run(() => {
      this.conn
        .prepare("UPDATE mailboxes SET zoho_accounts_base_url = ?, zoho_mail_base_url = ?, updated_at = ? WHERE email = ?")
        .run(accountsBaseUrl, mailBaseUrl, utcNow(), email.toLowerCase());
    });
  }

  listMailboxes(): Promise<Mailbox[]> {
    return this.run(() => {
      const rows = this.conn
        .prepare(
          `SELECT email, company, responsible, enabled, refresh_token_env,
                  refresh_token, zoho_client_id, zoho_client_secret, account_id,
                  zoho_accounts_base_url, zoho_mail_base_url
           FROM mailboxes ORDER BY company, email`,
        )
        .all() as Array<Record<string, unknown>>;
      return rows.map((row) => {
        const envName = String(row.refresh_token_env || "").trim();
        const stored = String(row.refresh_token || "").trim();
        const envToken = envName ? env(envName) : "";
        const token = stored || envToken;
        const pair = zohoClientPair(envName);
        const urls = zohoBaseUrls(envName);
        const accountsUrl = String(row.zoho_accounts_base_url || "").trim() || urls.accounts;
        const mailUrl = String(row.zoho_mail_base_url || "").trim() || urls.mail;
        return {
          email: String(row.email),
          company: String(row.company),
          responsible: String(row.responsible),
          refreshToken: token,
          refreshTokenEnv: envName,
          enabled: Boolean(row.enabled),
          accountId: row.account_id ? String(row.account_id) : null,
          zohoClientId: String(row.zoho_client_id || "").trim() || pair.clientId,
          zohoClientSecret: String(row.zoho_client_secret || "").trim() || pair.clientSecret,
          zohoAccountsBaseUrl: accountsUrl,
          zohoMailBaseUrl: mailUrl,
        };
      });
    });
  }

  listMailboxViews(): Promise<MailboxView[]> {
    return this.run(() => {
      const rows = this.conn
        .prepare(
          `SELECT email, company, responsible, enabled, refresh_token_env,
                  refresh_token IS NOT NULL AND refresh_token != '' AS has_stored_token,
                  zoho_client_id IS NOT NULL AND zoho_client_id != ''
                    AND zoho_client_secret IS NOT NULL AND zoho_client_secret != '' AS has_client,
                  account_id, zoho_accounts_base_url, zoho_mail_base_url
           FROM mailboxes ORDER BY company, email`,
        )
        .all() as Array<Record<string, unknown>>;
      return rows.map((row) => {
        const envName = String(row.refresh_token_env || "");
        const envSet = Boolean(envName && env(envName));
        let tokenSource: MailboxView["tokenSource"] = "missing";
        if (row.has_stored_token) tokenSource = "database";
        else if (envSet) tokenSource = "environment";
        return {
          email: String(row.email),
          company: String(row.company),
          responsible: String(row.responsible),
          enabled: Boolean(row.enabled),
          refreshTokenEnv: envName,
          tokenSource,
          hasClient: Boolean(row.has_client),
          accountId: row.account_id ? String(row.account_id) : "",
          zohoAccountsBaseUrl: String(row.zoho_accounts_base_url || ""),
          zohoMailBaseUrl: String(row.zoho_mail_base_url || ""),
        };
      });
    });
  }

  addMailbox(input: {
    email: string;
    company: string;
    responsible: string;
    enabled: boolean;
    refreshTokenEnv: string;
    refreshToken?: string;
    accountId?: string | null;
    zohoClientId?: string;
    zohoClientSecret?: string;
    zohoAccountsBaseUrl?: string;
    zohoMailBaseUrl?: string;
  }): Promise<void> {
    return this.run(() => {
      const fields = validateMailboxFields(input);
      const urls = optionalZohoUrls(input.zohoAccountsBaseUrl || "", input.zohoMailBaseUrl || "");
      const now = utcNow();
      const existing = this.conn.prepare("SELECT email FROM mailboxes WHERE email = ?").get(fields.email);
      if (existing) throw new ConfigError(`mailbox ${fields.email} already exists`);
      this.conn
        .prepare(
          `INSERT INTO mailboxes (
            email, company, responsible, enabled, refresh_token_env,
            refresh_token, zoho_client_id, zoho_client_secret, account_id,
            zoho_accounts_base_url, zoho_mail_base_url, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          fields.email,
          fields.company,
          fields.responsible,
          input.enabled ? 1 : 0,
          fields.refreshTokenEnv,
          input.refreshToken?.trim() || null,
          input.zohoClientId?.trim() || null,
          input.zohoClientSecret?.trim() || null,
          fields.accountId,
          urls.accounts,
          urls.mail,
          now,
          now,
        );
    });
  }

  updateMailbox(input: {
    email: string;
    company: string;
    responsible: string;
    enabled: boolean;
    refreshTokenEnv: string;
    refreshToken?: string;
    clearStoredToken?: boolean;
    accountId?: string | null;
    zohoClientId?: string;
    zohoClientSecret?: string;
    zohoAccountsBaseUrl?: string;
    zohoMailBaseUrl?: string;
  }): Promise<void> {
    return this.run(() => {
      const fields = validateMailboxFields(input);
      const current = this.conn.prepare("SELECT email FROM mailboxes WHERE email = ?").get(fields.email);
      if (!current) throw new ConfigError(`mailbox ${fields.email} was not found`);
      const params: unknown[] = [fields.company, fields.responsible, input.enabled ? 1 : 0, fields.refreshTokenEnv, fields.accountId];
      let extra = "";
      if (input.clearStoredToken) {
        extra = ", refresh_token = NULL, zoho_client_id = NULL, zoho_client_secret = NULL";
      } else {
        if (input.refreshToken?.trim()) {
          extra += ", refresh_token = ?";
          params.push(input.refreshToken.trim());
        }
        if (input.zohoClientId?.trim()) {
          extra += ", zoho_client_id = ?";
          params.push(input.zohoClientId.trim());
        }
        if (input.zohoClientSecret?.trim()) {
          extra += ", zoho_client_secret = ?";
          params.push(input.zohoClientSecret.trim());
        }
      }
      if (input.zohoAccountsBaseUrl != null || input.zohoMailBaseUrl != null) {
        const urls = optionalZohoUrls(input.zohoAccountsBaseUrl || "", input.zohoMailBaseUrl || "");
        extra += ", zoho_accounts_base_url = ?, zoho_mail_base_url = ?";
        params.push(urls.accounts, urls.mail);
      }
      params.push(utcNow(), fields.email);
      this.conn
        .prepare(
          `UPDATE mailboxes SET company = ?, responsible = ?, enabled = ?, refresh_token_env = ?,
           account_id = ?${extra}, updated_at = ? WHERE email = ?`,
        )
        .run(...params);
    });
  }

  deleteMailbox(email: string): Promise<void> {
    return this.run(() => {
      this.conn.prepare("DELETE FROM mailboxes WHERE email = ?").run(email.trim().toLowerCase());
    });
  }

  isProcessed(mailboxEmail: string, zohoMessageId: string): Promise<boolean> {
    return this.run(() => {
      const row = this.conn
        .prepare("SELECT 1 FROM processed_messages WHERE mailbox_email = ? AND zoho_message_id = ?")
        .get(mailboxEmail, zohoMessageId);
      return row != null;
    });
  }

  markProcessed(input: {
    mailboxEmail: string;
    zohoMessageId: string;
    originalMessageId: string | null;
    subject: string;
    providerMessageId: string;
  }): Promise<void> {
    return this.run(() => {
      this.conn
        .prepare(
          `INSERT OR IGNORE INTO processed_messages (
            mailbox_email, zoho_message_id, original_message_id, subject, provider_message_id, forwarded_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.mailboxEmail,
          input.zohoMessageId,
          clip(input.originalMessageId, 500),
          clip(input.subject, 300),
          clip(input.providerMessageId, 200),
          utcNow(),
        );
      this.conn
        .prepare("DELETE FROM forward_attempts WHERE mailbox_email = ? AND zoho_message_id = ?")
        .run(input.mailboxEmail, input.zohoMessageId);
    });
  }

  recordFailure(mailboxEmail: string, summary: MessageSummary, error: string): Promise<number> {
    return this.run(() => {
      const message = redactText(error).replace(/[\r\n]/g, " ").slice(0, 500);
      this.conn
        .prepare(
          `INSERT INTO forward_attempts (
            mailbox_email, zoho_message_id, folder_id, subject, from_address, to_address,
            received_time_ms, has_attachment, has_inline, attempts, last_error, last_attempt_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(mailbox_email, zoho_message_id) DO UPDATE SET
            folder_id = excluded.folder_id,
            subject = excluded.subject,
            from_address = excluded.from_address,
            to_address = excluded.to_address,
            received_time_ms = excluded.received_time_ms,
            has_attachment = excluded.has_attachment,
            has_inline = excluded.has_inline,
            attempts = forward_attempts.attempts + 1,
            last_error = excluded.last_error,
            last_attempt_at = excluded.last_attempt_at`,
        )
        .run(
          mailboxEmail,
          summary.messageId,
          summary.folderId,
          clip(summary.subject, 300),
          clip(summary.fromAddress, 300),
          clip(summary.toAddress, 500),
          summary.receivedTimeMs,
          summary.hasAttachment ? 1 : 0,
          summary.hasInline ? 1 : 0,
          message,
          utcNow(),
        );
      const row = this.conn
        .prepare("SELECT attempts FROM forward_attempts WHERE mailbox_email = ? AND zoho_message_id = ?")
        .get(mailboxEmail, summary.messageId) as { attempts: number } | undefined;
      return row?.attempts ?? 1;
    });
  }

  initialImportDone(mailboxEmail: string): Promise<boolean> {
    return this.run(() => {
      const row = this.conn
        .prepare("SELECT initial_import_done FROM mailbox_sync WHERE mailbox_email = ?")
        .get(mailboxEmail.toLowerCase()) as { initial_import_done: number } | undefined;
      return Boolean(row?.initial_import_done);
    });
  }

  markInitialImportDone(mailboxEmail: string): Promise<void> {
    return this.run(() => {
      this.conn
        .prepare(
          `INSERT INTO mailbox_sync (mailbox_email, initial_import_done, updated_at)
           VALUES (?, 1, ?)
           ON CONFLICT(mailbox_email) DO UPDATE SET initial_import_done = 1, updated_at = excluded.updated_at`,
        )
        .run(mailboxEmail.toLowerCase(), utcNow());
    });
  }

  listPending(mailboxEmail: string): Promise<MessageSummary[]> {
    return this.run(() => {
      const rows = this.conn
        .prepare(
          `SELECT zoho_message_id, folder_id, subject, from_address, to_address,
                  received_time_ms, has_attachment, has_inline
           FROM forward_attempts WHERE mailbox_email = ? ORDER BY received_time_ms ASC`,
        )
        .all(mailboxEmail) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        messageId: String(row.zoho_message_id),
        folderId: String(row.folder_id),
        subject: String(row.subject || ""),
        fromAddress: String(row.from_address || ""),
        toAddress: String(row.to_address || ""),
        receivedTimeMs: row.received_time_ms == null ? null : Number(row.received_time_ms),
        hasAttachment: Boolean(row.has_attachment),
        hasInline: Boolean(row.has_inline),
      }));
    });
  }

  getState(key: string): Promise<string | null> {
    return this.run(() => {
      const row = this.conn.prepare("SELECT value FROM forwarder_state WHERE key = ?").get(key) as { value: string } | undefined;
      return row?.value ?? null;
    });
  }

  setState(key: string, value: string): Promise<void> {
    return this.run(() => {
      this.conn
        .prepare(
          `INSERT INTO forwarder_state (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(key, value);
    });
  }

  listTable(name: ForwarderTableName, limit: number, offset: number): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    if (!FORWARDER_TABLES.includes(name)) throw new ConfigError("unknown table");
    return this.run(() => {
      const totalRow = this.conn.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as { n: number };
      const rows = this.conn.prepare(`SELECT * FROM ${name} LIMIT ? OFFSET ?`).all(limit, offset) as unknown[];
      return {
        total: totalRow.n,
        rows: rows.map((row) => sanitizeRow(asRecord(row))),
      };
    });
  }
}
