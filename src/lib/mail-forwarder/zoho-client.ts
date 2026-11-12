import { MessageTooLarge, ZohoAPIError, ZohoAuthError } from "@/lib/mail-forwarder/errors";
import { emptyMime, parseMime, safeFilename } from "@/lib/mail-forwarder/mime";
import { RefreshTokenAuth } from "@/lib/mail-forwarder/token-auth";
import type { Attachment, MessageSummary, OriginalEmail } from "@/lib/mail-forwarder/types";

const JSON_LIMIT = 8_000_000;
const MAX_PAGES = 25;
const PAGE_SIZE = 200;
const PATH_RE = /^[A-Za-z0-9]+$/;
const DATACENTERS: Array<[string, string]> = [
  ["https://accounts.zoho.eu", "https://mail.zoho.eu"],
  ["https://accounts.zoho.com", "https://mail.zoho.com"],
  ["https://accounts.zoho.in", "https://mail.zoho.in"],
  ["https://accounts.zoho.com.au", "https://mail.zoho.com.au"],
  ["https://accounts.zoho.jp", "https://mail.zoho.jp"],
  ["https://accounts.zohocloud.ca", "https://mail.zohocloud.ca"],
  ["https://accounts.zoho.sa", "https://mail.zoho.sa"],
];

export async function detectZohoDatacenter(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accounts: string; mail: string }> {
  let sawNetworkError = false;
  for (const [accounts, mail] of DATACENTERS) {
    let response: Response;
    try {
      response = await fetch(`${accounts}/oauth/v2/token`, {
        method: "POST",
        redirect: "error",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
    } catch {
      sawNetworkError = true;
      continue;
    }
    let payload: Record<string, unknown> = {};
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
    } catch {
      payload = {};
    }
    const error = typeof payload.error === "string" ? payload.error : "";
    const access = payload.access_token;
    if (response.ok && typeof access === "string" && access) return { accounts, mail };
    if (error === "invalid_client") continue;
    throw new ZohoAuthError(`Zoho token refresh failed (HTTP ${response.status})`, response.status >= 500);
  }
  if (sawNetworkError) throw new ZohoAuthError("Zoho token refresh failed (network error)");
  throw new ZohoAuthError("Zoho client was rejected by every data center", false);
}

export class ZohoClient {
  scanCapped = false;
  private readonly responseLimit: number;
  private readonly pageSize: number;

  constructor(
    private readonly auth: RefreshTokenAuth,
    private readonly mailBaseUrl: string,
    private readonly maxMessageBytes = 20_000_000,
  ) {
    this.responseLimit = Math.min(Math.max(maxMessageBytes * 3, JSON_LIMIT), 40_000_000);
    this.pageSize = PAGE_SIZE;
  }

  async prepare(email: string, accountId: string | null): Promise<{ accountId: string; folderId: string }> {
    const resolved = await this.resolveAccountId(email, accountId);
    const folderId = await this.resolveInboxFolder(resolved);
    return { accountId: resolved, folderId };
  }

  async resolveAccountId(email: string, configuredAccountId: string | null): Promise<string> {
    const accounts = await this.listAccounts();
    if (configuredAccountId) {
      const known = new Set(accounts.map((item) => String(item.accountId ?? "")));
      if (!known.has(configuredAccountId)) {
        throw new ZohoAPIError("configured account_id was not returned for the authorized Zoho user", {
          retryable: false,
        });
      }
      return configuredAccountId;
    }
    const matches = accounts.filter((item) => accountMatches(item, email));
    if (!matches.length) {
      throw new ZohoAPIError(`no Zoho account for ${email} is visible to this refresh token`, { retryable: false });
    }
    matches.sort((left, right) => {
      const rank = (item: Record<string, unknown>) => (String(item.type || "").toUpperCase() === "ZOHO_ACCOUNT" ? 0 : 1);
      return rank(left) - rank(right);
    });
    return String(matches[0].accountId);
  }

  async resolveInboxFolder(accountId: string): Promise<string> {
    return selectInboxFolderId(await this.listFolders(accountId));
  }

  async listAccounts(): Promise<Array<Record<string, unknown>>> {
    return asList(await this.getJson("/api/accounts"), "accounts");
  }

  async listFolders(accountId: string): Promise<Array<Record<string, unknown>>> {
    return asList(await this.getJson(`/api/accounts/${segment(accountId)}/folders`), "folders");
  }

  async listInbox(
    accountId: string,
    folderId: string,
    cutoffMs: number,
    maxPages?: number,
  ): Promise<MessageSummary[]> {
    const collected: MessageSummary[] = [];
    const seen = new Set<string>();
    let start = 1;
    const pageCap = maxPages == null ? MAX_PAGES : Math.max(1, maxPages);
    this.scanCapped = false;
    for (let page = 0; page < pageCap; page += 1) {
      const data = await this.getJson(`/api/accounts/${segment(accountId)}/messages/view`, {
        folderId,
        start: String(start),
        limit: String(this.pageSize),
        status: "all",
        sortBy: "date",
        sortorder: "false",
        includeto: "true",
        threadedMails: "false",
        includesent: "false",
      });
      if (!Array.isArray(data)) throw new ZohoAPIError("unexpected response from the list emails API");
      if (!data.length) break;
      const newest = receivedMs((data[0] as Record<string, unknown>) || {});
      if (newest != null && newest < cutoffMs) break;
      for (const item of data) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const received = receivedMs(record);
        if (received != null && received < cutoffMs) continue;
        const summary = summaryFromItem(record, folderId);
        if (!summary.messageId || seen.has(summary.messageId)) continue;
        seen.add(summary.messageId);
        collected.push(summary);
      }
      if (data.length < this.pageSize) break;
      start += data.length;
      if (page === pageCap - 1) this.scanCapped = true;
    }
    return collected;
  }

  async loadMessage(accountId: string, summary: MessageSummary, mailboxEmail: string): Promise<OriginalEmail> {
    const account = segment(accountId);
    const folder = segment(summary.folderId);
    const message = segment(summary.messageId);
    const mimeText = await this.originalMime(account, message);
    let parsed = emptyMime();
    if (mimeText) {
      try {
        parsed = await parseMime(mimeText);
      } catch {
        parsed = emptyMime();
      }
    }
    let headers: Record<string, string> = {};
    if (!parsed.messageId || !parsed.sender || !parsed.date) {
      headers = await this.headers(account, folder, message);
    }
    let plain = parsed.plain;
    let html = parsed.html;
    if (!plain && !html) {
      const fetched = await this.content(account, folder, message);
      if (fetched.includes("<") && fetched.includes(">")) html = fetched;
      else plain = fetched;
    }
    let attachments = [...parsed.attachments];
    const needsFiles = summary.hasAttachment && !attachments.some((item) => !item.inline);
    const needsInline = (summary.hasInline || html.includes("cid:")) && !attachments.some((item) => item.inline);
    if (needsFiles || needsInline) {
      const downloaded = await this.downloadAttachments(account, folder, message, needsFiles, needsInline);
      attachments = mergeAttachments(attachments, downloaded);
    }
    const sender = first(parsed.sender, headers.from || "", summary.fromAddress, "unknown");
    const recipient = first(parsed.recipient, headers.to || "", summary.toAddress, mailboxEmail);
    const subject = first(parsed.subject, headers.subject || "", summary.subject);
    let originalDate = first(parsed.date, headers.date || "");
    if (!originalDate && summary.receivedTimeMs != null) originalDate = formatMs(summary.receivedTimeMs);
    const messageId = first(parsed.messageId, headers["message-id"] || "") || null;
    return {
      sender,
      recipient,
      subject,
      plainBody: plain,
      htmlBody: html,
      originalDate: originalDate || "unknown",
      originalMessageId: messageId,
      attachments,
    };
  }

  private async originalMime(accountId: string, messageId: string): Promise<string> {
    try {
      const data = await this.getJson(`/api/accounts/${accountId}/messages/${messageId}/originalmessage`, undefined, this.responseLimit);
      if (!data || typeof data !== "object") return "";
      const content = (data as Record<string, unknown>).content;
      return typeof content === "string" ? content : "";
    } catch (error) {
      if (error instanceof ZohoAPIError && error.statusCode === 404) return "";
      throw error;
    }
  }

  private async headers(accountId: string, folderId: string, messageId: string): Promise<Record<string, string>> {
    const data = await this.getJson(`/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/header`, {
      raw: "false",
    });
    if (!data || typeof data !== "object") return {};
    const content = (data as Record<string, unknown>).headerContent;
    if (!content || typeof content !== "object") return {};
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
      if (Array.isArray(value)) mapped[key.toLowerCase()] = value.length ? String(value[0]) : "";
      else if (value != null) mapped[key.toLowerCase()] = String(value);
    }
    return mapped;
  }

  private async content(accountId: string, folderId: string, messageId: string): Promise<string> {
    const data = await this.getJson(
      `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`,
      { includeBlockContent: "true" },
      this.responseLimit,
    );
    if (!data || typeof data !== "object") return "";
    const content = (data as Record<string, unknown>).content;
    return typeof content === "string" ? content : "";
  }

  private async downloadAttachments(
    accountId: string,
    folderId: string,
    messageId: string,
    wantFiles: boolean,
    wantInline: boolean,
  ): Promise<Attachment[]> {
    const info = await this.getJson(
      `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachmentinfo`,
      { includeInline: "true" },
    );
    if (!info || typeof info !== "object") return [];
    const record = info as Record<string, unknown>;
    const selected: Array<{ item: Record<string, unknown>; inline: boolean }> = [];
    if (wantFiles) {
      for (const item of (record.attachments as unknown[]) || []) {
        if (item && typeof item === "object") selected.push({ item: item as Record<string, unknown>, inline: false });
      }
    }
    if (wantInline) {
      for (const item of (record.inline as unknown[]) || []) {
        if (item && typeof item === "object") selected.push({ item: item as Record<string, unknown>, inline: true });
      }
    }
    const downloaded: Attachment[] = [];
    let remaining = this.maxMessageBytes;
    for (const { item, inline } of selected) {
      const size = asInt(item.attachmentSize) || 0;
      if (size && size > remaining) throw new MessageTooLarge("attachment exceeds the forwarding size limit");
      const attachmentId = String(item.attachmentId || "").trim();
      if (!attachmentId) continue;
      const { data, contentType } = await this.downloadOne(accountId, folderId, messageId, segment(attachmentId), remaining);
      remaining -= data.length;
      const cid = item.cid ? String(item.cid).trim() : "";
      downloaded.push({
        filename: safeFilename(String(item.attachmentName || ""), `attachment-${downloaded.length + 1}.bin`),
        contentType,
        data,
        contentId: cid || null,
        inline,
      });
    }
    return downloaded;
  }

  private async downloadOne(
    accountId: string,
    folderId: string,
    messageId: string,
    attachmentId: string,
    limit: number,
  ): Promise<{ data: Buffer; contentType: string }> {
    const { status, headers, body } = await this.call(
      `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachments/${attachmentId}`,
      undefined,
      "application/octet-stream, application/json",
      limit,
    );
    let contentType = (headers["content-type"] || "application/octet-stream").split(";")[0].trim();
    if (status >= 400 || contentType.toLowerCase().includes("json")) throw errorFromBody(status, body);
    if (!contentType || contentType === "application/json") contentType = "application/octet-stream";
    return { data: body, contentType };
  }

  private async getJson(path: string, params?: Record<string, string>, limit = JSON_LIMIT): Promise<unknown> {
    const { status, body } = await this.call(path, params, "application/json", limit);
    if (status === 401) throw new ZohoAuthError("Zoho rejected the access token");
    if (status < 200 || status >= 300) throw errorFromBody(status, body);
    let payload: unknown;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      throw new ZohoAPIError("Zoho returned invalid JSON");
    }
    if (!payload || typeof payload !== "object") throw new ZohoAPIError("Zoho returned an unexpected payload");
    const statusBlock = (payload as Record<string, unknown>).status;
    if (statusBlock && typeof statusBlock === "object" && (statusBlock as Record<string, unknown>).code != null) {
      const code = Number((statusBlock as Record<string, unknown>).code) || 0;
      if (code !== 200) {
        const description = String((statusBlock as Record<string, unknown>).description || "Zoho API error").slice(0, 200);
        throw new ZohoAPIError(description, { statusCode: code, retryable: code >= 500 || code === 429 });
      }
    }
    return (payload as Record<string, unknown>).data;
  }

  private async call(
    path: string,
    params: Record<string, string> | undefined,
    accept: string,
    limit: number,
  ): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
    let token = await this.auth.getAccessToken();
    let result = await this.once(path, params, accept, limit, token);
    if (result.status === 401) {
      token = await this.auth.forceRefresh();
      result = await this.once(path, params, accept, limit, token);
    }
    return result;
  }

  private async once(
    path: string,
    params: Record<string, string> | undefined,
    accept: string,
    limit: number,
    token: string,
  ): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
    const url = new URL(`${this.mailBaseUrl.replace(/\/$/, "")}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "error",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          Accept: accept,
          "User-Agent": "admin-vitrina-mail-forwarder/1.0",
        },
      });
    } catch (error) {
      if (error instanceof MessageTooLarge) throw error;
      throw new ZohoAPIError("Zoho network error");
    }
    const readLimit = response.ok ? limit : Math.min(limit, 16_384);
    const body = await readLimited(response, readLimit);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { status: response.status, headers, body };
  }
}

export function accountMatches(account: Record<string, unknown>, email: string): boolean {
  const target = email.toLowerCase();
  const candidates: string[] = [];
  for (const key of ["primaryEmailAddress", "mailboxAddress", "incomingUserName"]) {
    const value = account[key];
    if (typeof value === "string" && value.trim()) candidates.push(value.trim());
  }
  for (const item of (account.emailAddress as unknown[]) || []) {
    if (item && typeof item === "object" && typeof (item as Record<string, unknown>).mailId === "string") {
      candidates.push(String((item as Record<string, unknown>).mailId));
    }
  }
  for (const item of (account.sendMailDetails as unknown[]) || []) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (!["", "mailbox"].includes(String(record.mode || "").toLowerCase())) continue;
    if (typeof record.fromAddress === "string") candidates.push(record.fromAddress);
  }
  return candidates.some((candidate) => candidate.toLowerCase() === target);
}

export function selectInboxFolderId(folders: Array<Record<string, unknown>>): string {
  const exact = folders.filter((item) => item.path === "/Inbox" && item.folderId);
  if (exact.length) return String(exact[0].folderId);
  const named = folders.filter(
    (item) =>
      String(item.folderName || "").toLowerCase() === "inbox" &&
      String(item.folderType || "").toLowerCase() === "inbox" &&
      item.folderId,
  );
  if (!named.length) throw new ZohoAPIError("Inbox folder was not found", { retryable: false });
  named.sort((left, right) => String(left.path || "").length - String(right.path || "").length);
  return String(named[0].folderId);
}

function summaryFromItem(item: Record<string, unknown>, defaultFolderId: string): MessageSummary {
  return {
    messageId: String(item.messageId || ""),
    folderId: String(item.folderId || defaultFolderId),
    subject: String(item.subject || ""),
    fromAddress: String(item.fromAddress || item.sender || ""),
    toAddress: String(item.toAddress || ""),
    receivedTimeMs: receivedMs(item),
    hasAttachment: flag(item.hasAttachment),
    hasInline: flag(item.hasInline),
  };
}

function receivedMs(item: Record<string, unknown>): number | null {
  return asInt(item.receivedTime);
}

function asInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function flag(value: unknown): boolean {
  return ["1", "true", "yes"].includes(String(value).trim().toLowerCase());
}

function asList(data: unknown, label: string): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["accounts", "folders", "account"]) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        return nested.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
      }
    }
    if ("accountId" in record || "folderId" in record) return [record];
  }
  throw new ZohoAPIError(`unexpected ${label} response`);
}

function segment(value: string): string {
  const text = String(value).trim();
  if (!PATH_RE.test(text)) throw new ZohoAPIError("refusing an unexpected Zoho id");
  return text;
}

function first(...values: string[]): string {
  for (const value of values) {
    if (value && value.trim() && value.trim().toLowerCase() !== "not provided") return value.trim();
  }
  return "";
}

function formatMs(value: number): string {
  return new Date(value).toUTCString();
}

function mergeAttachments(existing: Attachment[], extra: Attachment[]): Attachment[] {
  const seen = new Set(existing.map((item) => `${item.filename}|${item.data.length}|${item.inline}`));
  const merged = [...existing];
  for (const item of extra) {
    const key = `${item.filename}|${item.data.length}|${item.inline}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

async function readLimited(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer());
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) throw new MessageTooLarge("Zoho response exceeded the size limit");
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function errorFromBody(status: number, body: Buffer): ZohoAPIError {
  let description = "";
  try {
    const payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    const statusBlock = payload.status && typeof payload.status === "object" ? (payload.status as Record<string, unknown>) : {};
    const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
    description = String(statusBlock.description || data.moreInfo || "").slice(0, 200);
  } catch {
    description = "";
  }
  let message = `Zoho request failed (HTTP ${status})`;
  if (description) message = `${message}: ${description}`;
  return new ZohoAPIError(message, { statusCode: status, retryable: [408, 429, 500, 502, 503, 504].includes(status) });
}
