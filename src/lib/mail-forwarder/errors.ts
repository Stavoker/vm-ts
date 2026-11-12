export class MailForwarderError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "MailForwarderError";
    this.retryable = retryable;
  }
}

export class ConfigError extends MailForwarderError {
  constructor(message: string) {
    super(message, false);
    this.name = "ConfigError";
  }
}

export class ZohoAuthError extends MailForwarderError {
  constructor(message: string, retryable = true) {
    super(message, retryable);
    this.name = "ZohoAuthError";
  }
}

export class ZohoAPIError extends MailForwarderError {
  statusCode: number | null;

  constructor(message: string, options: { statusCode?: number | null; retryable?: boolean } = {}) {
    super(message, options.retryable ?? true);
    this.name = "ZohoAPIError";
    this.statusCode = options.statusCode ?? null;
  }
}

export class SendError extends MailForwarderError {
  constructor(message: string, retryable = true) {
    super(message, retryable);
    this.name = "SendError";
  }
}

export class MessageTooLarge extends MailForwarderError {
  constructor(message: string) {
    super(message, true);
    this.name = "MessageTooLarge";
  }
}
