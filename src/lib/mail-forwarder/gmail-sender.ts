import { SendError } from "@/lib/mail-forwarder/errors";
import { RefreshTokenAuth } from "@/lib/mail-forwarder/token-auth";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SEND_URL = `${API}/messages/send`;
const INSERT_URL = `${API}/messages`;
const LABELS_URL = `${API}/labels`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GmailSender {
  private readonly auth: RefreshTokenAuth;
  private readonly labels = new Map<string, string>();

  constructor(input: { clientId: string; clientSecret: string; refreshToken: string }) {
    this.auth = new RefreshTokenAuth({
      provider: "Gmail",
      tokenUrl: TOKEN_URL,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      refreshToken: input.refreshToken,
      errorType: SendError,
    });
  }

  async check(): Promise<void> {
    await this.auth.forceRefresh();
    await this.request("GET", LABELS_URL);
  }

  async send(rawMessage: Buffer, folder?: string | null): Promise<string> {
    const raw = rawMessage.toString("base64url");
    let payload: Record<string, unknown>;
    if (folder) {
      const labelId = await this.ensureLabel(folder);
      payload = await this.request("POST", INSERT_URL, { raw, labelIds: [labelId, "UNREAD"] });
    } else {
      payload = await this.request("POST", SEND_URL, { raw });
    }
    return typeof payload.id === "string" && payload.id ? payload.id : "gmail";
  }

  private async ensureLabel(folder: string): Promise<string> {
    const name = labelName(folder);
    const cached = this.labels.get(name);
    if (cached) return cached;
    const listed = await this.request("GET", LABELS_URL);
    const labels = Array.isArray(listed.labels) ? listed.labels : [];
    for (const item of labels) {
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        if (record.name === name && typeof record.id === "string") {
          this.labels.set(name, record.id);
          return record.id;
        }
      }
    }
    const created = await this.request("POST", LABELS_URL, {
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    });
    if (typeof created.id !== "string" || !created.id) throw new SendError("Gmail did not return a label id");
    this.labels.set(name, created.id);
    return created.id;
  }

  private async request(method: string, url: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    let token = await this.auth.getAccessToken();
    let result = await this.once(method, url, token, body);
    if (result.status === 401) {
      token = await this.auth.forceRefresh();
      result = await this.once(method, url, token, body);
    }
    if (result.status === 403) {
      throw new SendError(
        "Gmail refused labels or insert (HTTP 403). Re-authorize with https://www.googleapis.com/auth/gmail.modify",
      );
    }
    if (result.status < 200 || result.status >= 300) {
      throw new SendError(`Gmail request failed (HTTP ${result.status})${gmailDetail(result.payload)}`);
    }
    return result.payload;
  }

  private async once(
    method: string,
    url: string,
    token: string,
    body?: Record<string, unknown>,
  ): Promise<{ status: number; payload: Record<string, unknown> }> {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SendError("Gmail request failed (network error)");
    }
    let payload: Record<string, unknown> = {};
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
    } catch {
      payload = {};
    }
    return { status: response.status, payload };
  }
}

function labelName(folder: string): string {
  const name = folder.replace(/[\r\n]/g, " ").replace(/\//g, " ").replace(/\s+/g, " ").trim().slice(0, 225);
  if (!name) throw new SendError("Gmail folder name is empty");
  return name;
}

function gmailDetail(payload: Record<string, unknown>): string {
  const error = payload.error;
  let message = "";
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
    message = String((error as Record<string, unknown>).message);
  } else if (typeof error === "string") {
    message = error;
  }
  message = message.replace(/[\r\n]/g, " ").trim().slice(0, 200);
  return message ? `: ${message}` : "";
}
