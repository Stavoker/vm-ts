import type { AnalyticsErrorCode } from "./types";

export class AnalyticsError extends Error {
  code: AnalyticsErrorCode;
  status: number;

  constructor(code: AnalyticsErrorCode, message: string, status = 400) {
    super(message);
    this.name = "AnalyticsError";
    this.code = code;
    this.status = status;
  }
}

export const ERROR_MESSAGES: Record<AnalyticsErrorCode, string> = {
  missing_credentials:
    "Google Analytics credentials are missing. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY (or GOOGLE_APPLICATION_CREDENTIALS).",
  not_connected: "No GA4 property connected",
  permission_denied: "Google Analytics API permission denied",
  invalid_property: "Invalid GA4 Property ID",
  quota: "Google Analytics API quota reached",
  no_data: "No analytics data for selected period",
  invalid_query: "Invalid analytics query",
  unknown: "Google Analytics request failed",
};

export function mapGoogleError(error: unknown): AnalyticsError {
  if (error instanceof AnalyticsError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const codeValue =
    typeof error === "object" && error && "code" in error
      ? Number((error as { code?: number }).code)
      : undefined;

  if (/credentials|GOOGLE_CLIENT_EMAIL|GOOGLE_PRIVATE_KEY|GOOGLE_APPLICATION_CREDENTIALS/i.test(message)) {
    return new AnalyticsError("missing_credentials", ERROR_MESSAGES.missing_credentials, 500);
  }
  if (codeValue === 7 || /PERMISSION_DENIED|does not have access|caller does not have permission/i.test(message)) {
    return new AnalyticsError(
      "permission_denied",
      "Service account does not have access to this GA4 property.",
      403,
    );
  }
  if (codeValue === 8 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new AnalyticsError("quota", ERROR_MESSAGES.quota, 429);
  }
  if (
    codeValue === 3 ||
    codeValue === 5 ||
    /INVALID_ARGUMENT|INVALID_PROPERTY|not a valid|property ID|NOT_FOUND/i.test(message)
  ) {
    return new AnalyticsError("invalid_property", ERROR_MESSAGES.invalid_property, 400);
  }
  return new AnalyticsError("unknown", message || ERROR_MESSAGES.unknown, 502);
}

export function analyticsErrorPayload(error: unknown) {
  const mapped = mapGoogleError(error);
  return {
    status: mapped.status,
    body: { error: mapped.message, code: mapped.code },
  };
}
