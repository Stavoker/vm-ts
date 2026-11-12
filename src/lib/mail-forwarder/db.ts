import type { SupabaseClient } from "@supabase/supabase-js";
import { ConfigError } from "@/lib/mail-forwarder/errors";
import { Mutex } from "@/lib/mail-forwarder/mutex";
import { env, httpsOrigin, zohoBaseUrls, zohoClientPair } from "@/lib/mail-forwarder/settings";
import { createServerSupabase } from "@/lib/supabase";
import type { Mailbox, MailboxView, MessageSummary } from "@/lib/mail-forwarder/types";
import { FORWARDER_TABLES, type ForwarderTableName } from "@/lib/mail-forwarder/types";
import { redactText, sanitizeRow } from "@/lib/mail-forwarder/redact";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STATE_PREFIX = "__forwarder__:";

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

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
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

function throwIfError(error: { message: string; code?: string } | null, fallback: string) {
  if (!error) return;
  if (error.code === "23505") throw new ConfigError("mailbox already exists");
  if (error.code === "42501") {
    throw new Error("Supabase denied access to mail forwarder tables. Run supabase/mail_forwarder.sql in the SQL editor.");
  }
  throw new Error(error.message || fallback);
}

export class ForwarderDatabase {
  private readonly mutex = new Mutex();

  constructor(private readonly client: SupabaseClient = createServerSupabase()) {}

  close(): void {}

  private run<T>(fn: () => Promise<T>): Promise<T> {
    return this.mutex.run(fn);
  }

  seedMailboxesIfEmpty(mailboxes: Mailbox[]): Promise<number> {
    return this.run(async () => {
      const { count, error } = await this.client.from("mailboxes").select("email", { count: "exact", head: true });
      throwIfError(error, "Failed to count mailboxes");
      if (count) return 0;
      const now = utcNow();
      const { error: insertError } = await this.client.from("mailboxes").insert(
        mailboxes.map((mailbox) => ({
          email: mailbox.email.toLowerCase(),
          company: mailbox.company,
          responsible: mailbox.responsible,
          enabled: mailbox.enabled ? 1 : 0,
          refresh_token_env: mailbox.refreshTokenEnv,
          refresh_token: null,
          account_id: mailbox.accountId,
          created_at: now,
          updated_at: now,
        })),
      );
      throwIfError(insertError, "Failed to seed mailboxes");
      return mailboxes.length;
    });
  }

  saveZohoUrls(email: string, accountsBaseUrl: string, mailBaseUrl: string): Promise<void> {
    return this.run(async () => {
      const { error } = await this.client
        .from("mailboxes")
        .update({ zoho_accounts_base_url: accountsBaseUrl, zoho_mail_base_url: mailBaseUrl, updated_at: utcNow() })
        .eq("email", email.toLowerCase());
      throwIfError(error, "Failed to save Zoho URLs");
    });
  }

  listMailboxes(): Promise<Mailbox[]> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from("mailboxes")
        .select(
          "email, company, responsible, enabled, refresh_token_env, refresh_token, zoho_client_id, zoho_client_secret, account_id, zoho_accounts_base_url, zoho_mail_base_url",
        )
        .order("company")
        .order("email");
      throwIfError(error, "Failed to list mailboxes");
      return (data ?? []).map((row) => {
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
          enabled: flag(row.enabled),
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
    return this.run(async () => {
      const { data, error } = await this.client
        .from("mailboxes")
        .select(
          "email, company, responsible, enabled, refresh_token_env, refresh_token, zoho_client_id, zoho_client_secret, account_id, zoho_accounts_base_url, zoho_mail_base_url",
        )
        .order("company")
        .order("email");
      throwIfError(error, "Failed to list mailbox views");
      return (data ?? []).map((row) => {
        const envName = String(row.refresh_token_env || "");
        const envSet = Boolean(envName && env(envName));
        const hasStoredToken = Boolean(String(row.refresh_token || "").trim());
        const hasClient = Boolean(String(row.zoho_client_id || "").trim() && String(row.zoho_client_secret || "").trim());
        let tokenSource: MailboxView["tokenSource"] = "missing";
        if (hasStoredToken) tokenSource = "database";
        else if (envSet) tokenSource = "environment";
        return {
          email: String(row.email),
          company: String(row.company),
          responsible: String(row.responsible),
          enabled: flag(row.enabled),
          refreshTokenEnv: envName,
          tokenSource,
          hasClient,
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
    return this.run(async () => {
      const fields = validateMailboxFields(input);
      const urls = optionalZohoUrls(input.zohoAccountsBaseUrl || "", input.zohoMailBaseUrl || "");
      const now = utcNow();
      const { data: existing, error: existingError } = await this.client
        .from("mailboxes")
        .select("email")
        .eq("email", fields.email)
        .maybeSingle();
      throwIfError(existingError, "Failed to check mailbox");
      if (existing) throw new ConfigError(`mailbox ${fields.email} already exists`);
      const { error } = await this.client.from("mailboxes").insert({
        email: fields.email,
        company: fields.company,
        responsible: fields.responsible,
        enabled: input.enabled ? 1 : 0,
        refresh_token_env: fields.refreshTokenEnv,
        refresh_token: input.refreshToken?.trim() || null,
        zoho_client_id: input.zohoClientId?.trim() || null,
        zoho_client_secret: input.zohoClientSecret?.trim() || null,
        account_id: fields.accountId,
        zoho_accounts_base_url: urls.accounts,
        zoho_mail_base_url: urls.mail,
        created_at: now,
        updated_at: now,
      });
      throwIfError(error, "Failed to add mailbox");
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
    return this.run(async () => {
      const fields = validateMailboxFields(input);
      const { data: current, error: currentError } = await this.client
        .from("mailboxes")
        .select("email")
        .eq("email", fields.email)
        .maybeSingle();
      throwIfError(currentError, "Failed to load mailbox");
      if (!current) throw new ConfigError(`mailbox ${fields.email} was not found`);
      const patch: Record<string, unknown> = {
        company: fields.company,
        responsible: fields.responsible,
        enabled: input.enabled ? 1 : 0,
        refresh_token_env: fields.refreshTokenEnv,
        account_id: fields.accountId,
        updated_at: utcNow(),
      };
      if (input.clearStoredToken) {
        patch.refresh_token = null;
        patch.zoho_client_id = null;
        patch.zoho_client_secret = null;
      } else {
        if (input.refreshToken?.trim()) patch.refresh_token = input.refreshToken.trim();
        if (input.zohoClientId?.trim()) patch.zoho_client_id = input.zohoClientId.trim();
        if (input.zohoClientSecret?.trim()) patch.zoho_client_secret = input.zohoClientSecret.trim();
      }
      if (input.zohoAccountsBaseUrl != null || input.zohoMailBaseUrl != null) {
        const urls = optionalZohoUrls(input.zohoAccountsBaseUrl || "", input.zohoMailBaseUrl || "");
        patch.zoho_accounts_base_url = urls.accounts;
        patch.zoho_mail_base_url = urls.mail;
      }
      const { error } = await this.client.from("mailboxes").update(patch).eq("email", fields.email);
      throwIfError(error, "Failed to update mailbox");
    });
  }

  deleteMailbox(email: string): Promise<void> {
    return this.run(async () => {
      const { error } = await this.client.from("mailboxes").delete().eq("email", email.trim().toLowerCase());
      throwIfError(error, "Failed to delete mailbox");
    });
  }

  isProcessed(mailboxEmail: string, zohoMessageId: string): Promise<boolean> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from("processed_messages")
        .select("zoho_message_id")
        .eq("mailbox_email", mailboxEmail)
        .eq("zoho_message_id", zohoMessageId)
        .maybeSingle();
      throwIfError(error, "Failed to check processed message");
      return data != null;
    });
  }

  markProcessed(input: {
    mailboxEmail: string;
    zohoMessageId: string;
    originalMessageId: string | null;
    subject: string;
    providerMessageId: string;
  }): Promise<void> {
    return this.run(async () => {
      const { error } = await this.client.from("processed_messages").upsert(
        {
          mailbox_email: input.mailboxEmail,
          zoho_message_id: input.zohoMessageId,
          original_message_id: clip(input.originalMessageId, 500),
          subject: clip(input.subject, 300),
          provider_message_id: clip(input.providerMessageId, 200),
          forwarded_at: utcNow(),
        },
        { onConflict: "mailbox_email,zoho_message_id", ignoreDuplicates: true },
      );
      throwIfError(error, "Failed to mark processed");
      const { error: deleteError } = await this.client
        .from("forward_attempts")
        .delete()
        .eq("mailbox_email", input.mailboxEmail)
        .eq("zoho_message_id", input.zohoMessageId);
      throwIfError(deleteError, "Failed to clear forward attempt");
    });
  }

  recordFailure(mailboxEmail: string, summary: MessageSummary, error: string): Promise<number> {
    return this.run(async () => {
      const message = redactText(error).replace(/[\r\n]/g, " ").slice(0, 500);
      const { data: existing, error: existingError } = await this.client
        .from("forward_attempts")
        .select("attempts")
        .eq("mailbox_email", mailboxEmail)
        .eq("zoho_message_id", summary.messageId)
        .maybeSingle();
      throwIfError(existingError, "Failed to load forward attempt");
      const attempts = Number(existing?.attempts ?? 0) + 1;
      const { error: upsertError } = await this.client.from("forward_attempts").upsert(
        {
          mailbox_email: mailboxEmail,
          zoho_message_id: summary.messageId,
          folder_id: summary.folderId,
          subject: clip(summary.subject, 300),
          from_address: clip(summary.fromAddress, 300),
          to_address: clip(summary.toAddress, 500),
          received_time_ms: summary.receivedTimeMs,
          has_attachment: summary.hasAttachment ? 1 : 0,
          has_inline: summary.hasInline ? 1 : 0,
          attempts,
          last_error: message,
          last_attempt_at: utcNow(),
        },
        { onConflict: "mailbox_email,zoho_message_id" },
      );
      throwIfError(upsertError, "Failed to record forward attempt");
      return attempts;
    });
  }

  initialImportDone(mailboxEmail: string): Promise<boolean> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from("mailbox_sync")
        .select("initial_import_done")
        .eq("mailbox_email", mailboxEmail.toLowerCase())
        .maybeSingle();
      throwIfError(error, "Failed to read mailbox sync");
      return flag(data?.initial_import_done);
    });
  }

  markInitialImportDone(mailboxEmail: string): Promise<void> {
    return this.run(async () => {
      const { error } = await this.client.from("mailbox_sync").upsert(
        {
          mailbox_email: mailboxEmail.toLowerCase(),
          initial_import_done: 1,
          updated_at: utcNow(),
        },
        { onConflict: "mailbox_email" },
      );
      throwIfError(error, "Failed to mark initial import");
    });
  }

  listPending(mailboxEmail: string): Promise<MessageSummary[]> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from("forward_attempts")
        .select("zoho_message_id, folder_id, subject, from_address, to_address, received_time_ms, has_attachment, has_inline")
        .eq("mailbox_email", mailboxEmail)
        .order("received_time_ms", { ascending: true });
      throwIfError(error, "Failed to list pending forwards");
      return (data ?? []).map((row) => ({
        messageId: String(row.zoho_message_id),
        folderId: String(row.folder_id),
        subject: String(row.subject || ""),
        fromAddress: String(row.from_address || ""),
        toAddress: String(row.to_address || ""),
        receivedTimeMs: row.received_time_ms == null ? null : Number(row.received_time_ms),
        hasAttachment: flag(row.has_attachment),
        hasInline: flag(row.has_inline),
      }));
    });
  }

  getState(key: string): Promise<string | null> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from("mailbox_sync")
        .select("updated_at")
        .eq("mailbox_email", `${STATE_PREFIX}${key}`)
        .maybeSingle();
      throwIfError(error, "Failed to read forwarder state");
      return data?.updated_at ? String(data.updated_at) : null;
    });
  }

  setState(key: string, value: string): Promise<void> {
    return this.run(async () => {
      const { error } = await this.client.from("mailbox_sync").upsert(
        {
          mailbox_email: `${STATE_PREFIX}${key}`,
          initial_import_done: 0,
          updated_at: value,
        },
        { onConflict: "mailbox_email" },
      );
      throwIfError(error, "Failed to write forwarder state");
    });
  }

  listTable(name: ForwarderTableName, limit: number, offset: number): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    if (!FORWARDER_TABLES.includes(name)) throw new ConfigError("unknown table");
    return this.run(async () => {
      const { count, error: countError } = await this.client.from(name).select("*", { count: "exact", head: true });
      throwIfError(countError, "Failed to count table");
      const { data, error } = await this.client.from(name).select("*").range(offset, offset + Math.max(limit, 1) - 1);
      throwIfError(error, "Failed to list table");
      return {
        total: count ?? 0,
        rows: (data ?? []).map((row) => sanitizeRow(asRecord(row))),
      };
    });
  }
}
