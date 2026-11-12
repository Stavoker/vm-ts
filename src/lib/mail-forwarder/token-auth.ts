import { MailForwarderError } from "@/lib/mail-forwarder/errors";

type AuthOptions = {
  provider: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  errorType: new (message: string, retryable?: boolean) => MailForwarderError;
};

export class RefreshTokenAuth {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<string> | null = null;

  constructor(private readonly options: AuthOptions) {}

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) return this.accessToken;
    return this.forceRefresh();
  }

  async forceRefresh(): Promise<string> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refresh();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  private async refresh(): Promise<string> {
    const { ErrorType } = { ErrorType: this.options.errorType };
    let response: Response;
    try {
      response = await fetch(this.options.tokenUrl, {
        method: "POST",
        redirect: "error",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          refresh_token: this.options.refreshToken,
          grant_type: "refresh_token",
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
        }),
      });
    } catch {
      throw new ErrorType(`${this.options.provider} token refresh failed (network error)`);
    }
    let payload: Record<string, unknown> = {};
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
    } catch {
      throw new ErrorType(`${this.options.provider} token refresh failed (invalid response)`);
    }
    if (!response.ok) {
      const detail = [payload.error, payload.error_description]
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .join(": ")
        .slice(0, 160);
      throw new ErrorType(
        `${this.options.provider} token refresh failed (HTTP ${response.status}${detail ? `: ${detail}` : ""})`,
      );
    }
    const token = payload.access_token;
    if (typeof token !== "string" || !token) {
      const error = typeof payload.error === "string" ? payload.error.slice(0, 80) : "missing access_token";
      throw new ErrorType(`${this.options.provider} token refresh failed (${error})`);
    }
    const expiresIn = Number(payload.expires_in || 3600) || 3600;
    this.accessToken = token;
    this.expiresAt = Date.now() + Math.max(expiresIn - 60, 30) * 1000;
    return token;
  }
}
