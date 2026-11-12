export type Mailbox = {
  email: string;
  company: string;
  responsible: string;
  refreshToken: string;
  refreshTokenEnv: string;
  enabled: boolean;
  accountId: string | null;
  zohoClientId: string | null;
  zohoClientSecret: string | null;
  zohoAccountsBaseUrl: string | null;
  zohoMailBaseUrl: string | null;
};

export type MailboxView = {
  email: string;
  company: string;
  responsible: string;
  enabled: boolean;
  refreshTokenEnv: string;
  tokenSource: "database" | "environment" | "missing";
  hasClient: boolean;
  accountId: string;
  zohoAccountsBaseUrl: string;
  zohoMailBaseUrl: string;
};

export type MessageSummary = {
  messageId: string;
  folderId: string;
  subject: string;
  fromAddress: string;
  toAddress: string;
  receivedTimeMs: number | null;
  hasAttachment: boolean;
  hasInline: boolean;
};

export type Attachment = {
  filename: string;
  contentType: string;
  data: Buffer;
  contentId: string | null;
  inline: boolean;
};

export type OriginalEmail = {
  sender: string;
  recipient: string;
  subject: string;
  plainBody: string;
  htmlBody: string;
  originalDate: string;
  originalMessageId: string | null;
  attachments: Attachment[];
};

export type ForwarderSettings = {
  zohoClientId: string;
  zohoClientSecret: string;
  zohoAccountsBaseUrl: string;
  zohoMailBaseUrl: string;
  destinationEmail: string;
  sendMethod: "gmail" | "smtp";
  senderEmail: string;
  gmailClientId: string | null;
  gmailClientSecret: string | null;
  gmailRefreshToken: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPassword: string | null;
  pollIntervalSeconds: number;
  lookbackMinutes: number;
  initialImport: boolean;
  maxMessagesPerPoll: number;
  maxMessageBytes: number;
};

export type PollMailboxResult = {
  email: string;
  forwarded: number;
  failed: number;
};

export type PollTotals = {
  mailboxes: number;
  forwarded: number;
  failed: number;
  importing: number;
  skipped?: boolean;
  byMailbox: PollMailboxResult[];
};

export type MailboxCheckResult = {
  email: string;
  company: string;
  ok: boolean;
  accountId?: string;
  folderId?: string;
  listedInLookback?: number;
  unprocessedInLookback?: number;
  error?: string;
};

export type SenderCheckResult = {
  ok: boolean;
  sendMethod: string;
  error?: string;
};

export type CheckResult = {
  ok: boolean;
  sender: SenderCheckResult | null;
  mailboxes: MailboxCheckResult[];
};

export const FORWARDER_TABLES = [
  "mailboxes",
  "processed_messages",
  "forward_attempts",
  "mailbox_sync",
] as const;

export type ForwarderTableName = (typeof FORWARDER_TABLES)[number];
