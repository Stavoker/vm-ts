import { createHash } from "node:crypto";
import { ConfigError, MailForwarderError } from "@/lib/mail-forwarder/errors";
import { ForwarderDatabase } from "@/lib/mail-forwarder/db";
import { buildForwardedMessage } from "@/lib/mail-forwarder/forward-message";
import { GmailSender } from "@/lib/mail-forwarder/gmail-sender";
import { SmtpSender } from "@/lib/mail-forwarder/smtp-sender";
import { detectZohoDatacenter, ZohoClient } from "@/lib/mail-forwarder/zoho-client";
import { redactText } from "@/lib/mail-forwarder/redact";
import { RefreshTokenAuth } from "@/lib/mail-forwarder/token-auth";
import type {
  CheckResult,
  ForwarderSettings,
  Mailbox,
  MailboxCheckResult,
  MessageSummary,
  PollTotals,
} from "@/lib/mail-forwarder/types";
import { ZohoAuthError } from "@/lib/mail-forwarder/errors";

type Sender = GmailSender | SmtpSender;

export function buildSender(settings: ForwarderSettings): Sender {
  if (settings.sendMethod === "smtp") {
    if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUsername || !settings.smtpPassword) {
      throw new ConfigError("SMTP settings are incomplete");
    }
    return new SmtpSender({
      host: settings.smtpHost,
      port: settings.smtpPort,
      username: settings.smtpUsername,
      password: settings.smtpPassword,
    });
  }
  if (!settings.gmailClientId || !settings.gmailClientSecret || !settings.gmailRefreshToken) {
    throw new ConfigError("Gmail settings are incomplete");
  }
  return new GmailSender({
    clientId: settings.gmailClientId,
    clientSecret: settings.gmailClientSecret,
    refreshToken: settings.gmailRefreshToken,
  });
}

export class MailForwarderWorker {
  private readonly clients = new Map<string, ZohoClient>();
  private readonly clientTokens = new Map<string, string>();

  constructor(
    private readonly settings: ForwarderSettings,
    private readonly database: ForwarderDatabase,
    private readonly sender: Sender | null,
  ) {}

  async check(): Promise<CheckResult> {
    const mailboxes: MailboxCheckResult[] = [];
    let senderResult: CheckResult["sender"] = null;
    let ok = true;
    if (this.sender) {
      try {
        await this.sender.check();
        senderResult = { ok: true, sendMethod: this.settings.sendMethod };
      } catch (error) {
        ok = false;
        senderResult = {
          ok: false,
          sendMethod: this.settings.sendMethod,
          error: redactText(error instanceof Error ? error.message : "sender check failed").slice(0, 500),
        };
      }
    }
    const cutoff = cutoffMs(this.settings.lookbackMinutes);
    for (const mailbox of await this.enabledMailboxes()) {
      try {
        const source = this.clientFor(mailbox);
        const prepared = await source.prepare(mailbox.email, mailbox.accountId);
        const listed = await source.listInbox(prepared.accountId, prepared.folderId, cutoff);
        let pending = 0;
        for (const item of listed) {
          if (!(await this.database.isProcessed(mailbox.email, item.messageId))) pending += 1;
        }
        mailboxes.push({
          email: mailbox.email,
          company: mailbox.company,
          ok: true,
          accountId: prepared.accountId,
          folderId: prepared.folderId,
          listedInLookback: listed.length,
          unprocessedInLookback: pending,
        });
      } catch (error) {
        ok = false;
        mailboxes.push({
          email: mailbox.email,
          company: mailbox.company,
          ok: false,
          error: redactText(error instanceof Error ? error.message : "mailbox check failed").slice(0, 500),
        });
      }
    }
    return { ok, sender: senderResult, mailboxes };
  }

  async runOnce(): Promise<PollTotals> {
    const totals: PollTotals = { mailboxes: 0, forwarded: 0, failed: 0, importing: 0, byMailbox: [] };
    for (const mailbox of await this.enabledMailboxes()) {
      const result = await this.pollMailbox(mailbox);
      totals.mailboxes += 1;
      totals.forwarded += result.forwarded;
      totals.failed += result.failed;
      totals.importing += result.importing ? 1 : 0;
      if (result.forwarded > 0 || result.failed > 0) {
        totals.byMailbox.push({
          email: mailbox.email,
          forwarded: result.forwarded,
          failed: result.failed,
        });
      }
    }
    console.log("[mail-forwarder] poll finished", totals);
    return totals;
  }

  private async pollMailbox(mailbox: Mailbox): Promise<{ forwarded: number; failed: number; importing: boolean }> {
    let forwarded = 0;
    let failed = 0;
    let importing = this.settings.initialImport && !(await this.database.initialImportDone(mailbox.email));
    const cutoff = importing ? 0 : cutoffMs(this.settings.lookbackMinutes);
    try {
      const source = this.clientFor(mailbox);
      const prepared = await source.prepare(mailbox.email, mailbox.accountId);
      const byId = new Map<string, MessageSummary>();
      const listed = await source.listInbox(prepared.accountId, prepared.folderId, cutoff, importing ? 200 : undefined);
      for (const item of listed) byId.set(item.messageId, item);
      for (const pending of await this.database.listPending(mailbox.email)) {
        if (!byId.has(pending.messageId)) byId.set(pending.messageId, pending);
      }
      const candidates = [...byId.values()]
        .filter((item) => item.messageId)
        .sort((left, right) => (left.receivedTimeMs || 0) - (right.receivedTimeMs || 0) || left.messageId.localeCompare(right.messageId));
      const unprocessed: MessageSummary[] = [];
      for (const item of candidates) {
        if (!(await this.database.isProcessed(mailbox.email, item.messageId))) unprocessed.push(item);
      }
      const limited = unprocessed.slice(0, this.settings.maxMessagesPerPoll);
      for (const summary of limited) {
        if (await this.forwardOne(mailbox, source, prepared.accountId, summary)) forwarded += 1;
        else failed += 1;
      }
      console.log("[mail-forwarder] mailbox poll complete", {
        mailbox: mailbox.email,
        candidates: limited.length,
        forwarded,
        failed,
        importing,
      });
      if (importing && failed === 0) {
        const unfinished: MessageSummary[] = [];
        for (const item of listed) {
          if (!(await this.database.isProcessed(mailbox.email, item.messageId))) unfinished.push(item);
        }
        const pending = await this.database.listPending(mailbox.email);
        if (!unfinished.length && !pending.length) {
          if (source.scanCapped) {
            console.warn("[mail-forwarder] initial import stopped at the page cap", mailbox.email);
          }
          await this.database.markInitialImportDone(mailbox.email);
          importing = false;
        }
      }
    } catch (error) {
      failed += 1;
      console.error("[mail-forwarder] mailbox poll failed", mailbox.email, redactText(error instanceof Error ? error.message : "error"));
    }
    return { forwarded, failed, importing };
  }

  private async forwardOne(
    mailbox: Mailbox,
    source: ZohoClient,
    accountId: string,
    summary: MessageSummary,
  ): Promise<boolean> {
    if (!this.sender) throw new MailForwarderError("sender is not configured", false);
    try {
      if (await this.database.isProcessed(mailbox.email, summary.messageId)) return true;
      const original = await source.loadMessage(accountId, summary, mailbox.email);
      const message = await buildForwardedMessage({
        original,
        mailboxEmail: mailbox.email,
        company: mailbox.company,
        responsible: mailbox.responsible,
        destinationEmail: this.settings.destinationEmail,
        senderEmail: this.settings.senderEmail,
      });
      if (message.length > this.settings.maxMessageBytes) {
        throw new MailForwarderError(`forwarded message is ${message.length} bytes, over the configured limit`);
      }
      if (await this.database.isProcessed(mailbox.email, summary.messageId)) return true;
      const providerId =
        this.sender instanceof GmailSender
          ? await this.sender.send(message, mailbox.company)
          : await this.sender.send(message);
      await this.database.markProcessed({
        mailboxEmail: mailbox.email,
        zohoMessageId: summary.messageId,
        originalMessageId: original.originalMessageId,
        subject: original.subject,
        providerMessageId: String(providerId),
      });
      console.log("[mail-forwarder] forwarded", mailbox.email, summary.messageId);
      return true;
    } catch (error) {
      const attempts = await this.database.recordFailure(
        mailbox.email,
        summary,
        error instanceof Error ? error.message : "forward failed",
      );
      console.error(
        "[mail-forwarder] forward failed",
        mailbox.email,
        summary.messageId,
        attempts,
        redactText(error instanceof Error ? error.message : "forward failed").slice(0, 300),
      );
      return false;
    }
  }

  private async enabledMailboxes(): Promise<Mailbox[]> {
    const ready: Mailbox[] = [];
    for (const mailbox of await this.database.listMailboxes()) {
      if (!mailbox.enabled) continue;
      if (!mailbox.refreshToken || !(mailbox.zohoClientId || this.settings.zohoClientId)) {
        console.error("[mail-forwarder] enabled mailbox has no refresh token", mailbox.email);
        continue;
      }
      const resolved = await this.withDatacenter(mailbox);
      if (resolved.zohoMailBaseUrl) ready.push(resolved);
    }
    return ready;
  }

  private async withDatacenter(mailbox: Mailbox): Promise<Mailbox> {
    if (mailbox.zohoAccountsBaseUrl && mailbox.zohoMailBaseUrl) return mailbox;
    if (!mailbox.zohoClientId) {
      return {
        ...mailbox,
        zohoAccountsBaseUrl: this.settings.zohoAccountsBaseUrl,
        zohoMailBaseUrl: this.settings.zohoMailBaseUrl,
      };
    }
    const clientId = mailbox.zohoClientId || this.settings.zohoClientId;
    const clientSecret = mailbox.zohoClientSecret || this.settings.zohoClientSecret;
    try {
      const detected = await detectZohoDatacenter(clientId, clientSecret, mailbox.refreshToken);
      await this.database.saveZohoUrls(mailbox.email, detected.accounts, detected.mail);
      return { ...mailbox, zohoAccountsBaseUrl: detected.accounts, zohoMailBaseUrl: detected.mail };
    } catch (error) {
      console.error(
        "[mail-forwarder] zoho datacenter was not detected",
        mailbox.email,
        redactText(error instanceof Error ? error.message : "error"),
      );
      return mailbox;
    }
  }

  private clientFor(mailbox: Mailbox): ZohoClient {
    const material = [mailbox.refreshToken, mailbox.zohoClientId || "", mailbox.zohoMailBaseUrl || ""].join("|");
    const tokenId = createHash("sha256").update(material).digest("hex").slice(0, 16);
    const existing = this.clients.get(mailbox.email);
    if (existing && this.clientTokens.get(mailbox.email) === tokenId) return existing;
    const auth = new RefreshTokenAuth({
      provider: "Zoho",
      tokenUrl: `${mailbox.zohoAccountsBaseUrl || this.settings.zohoAccountsBaseUrl}/oauth/v2/token`,
      clientId: mailbox.zohoClientId || this.settings.zohoClientId,
      clientSecret: mailbox.zohoClientSecret || this.settings.zohoClientSecret,
      refreshToken: mailbox.refreshToken,
      errorType: ZohoAuthError,
    });
    const client = new ZohoClient(
      auth,
      mailbox.zohoMailBaseUrl || this.settings.zohoMailBaseUrl,
      this.settings.maxMessageBytes,
    );
    this.clients.set(mailbox.email, client);
    this.clientTokens.set(mailbox.email, tokenId);
    return client;
  }
}

function cutoffMs(lookbackMinutes: number): number {
  return Date.now() - lookbackMinutes * 60 * 1000;
}
