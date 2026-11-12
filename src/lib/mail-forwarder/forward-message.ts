import { randomUUID } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import { htmlFragment, htmlToText } from "@/lib/mail-forwarder/mime";
import type { Attachment, OriginalEmail } from "@/lib/mail-forwarder/types";

export function safeHeader(value: string): string {
  return [...String(value)].map((char) => (char === "\r" || char === "\n" || char === "\0" ? " " : char)).join("").trim();
}

export function prefixedSubject(company: string, mailboxEmail: string, subject: string): string {
  const prefix = `[${safeHeader(company)}] ${safeHeader(mailboxEmail)} — `;
  const cleaned = safeHeader(subject);
  let combined = cleaned.startsWith(prefix) ? cleaned : cleaned ? prefix + cleaned : `${prefix}(no subject)`;
  return combined.slice(0, 900);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function metadataPlain(input: {
  mailboxEmail: string;
  sender: string;
  recipient: string;
  originalDate: string;
  company: string;
  responsible: string;
  body: string;
}): string {
  return [
    `Forwarded from: ${input.mailboxEmail}`,
    `Original sender: ${input.sender}`,
    `Original recipient: ${input.recipient}`,
    `Original date: ${input.originalDate}`,
    `Company: ${input.company}`,
    `Responsible: ${input.responsible}`,
    "",
    input.body,
  ]
    .join("\n")
    .replace(/\s+$/, "") + "\n";
}

function metadataHtml(input: {
  mailboxEmail: string;
  sender: string;
  recipient: string;
  originalDate: string;
  company: string;
  responsible: string;
  body: string;
}): string {
  const rows: Array<[string, string]> = [
    ["Forwarded from:", input.mailboxEmail],
    ["Original sender:", input.sender],
    ["Original recipient:", input.recipient],
    ["Original date:", input.originalDate],
    ["Company:", input.company],
    ["Responsible:", input.responsible],
  ];
  const preamble = rows
    .map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</p>`)
    .join("");
  return `<div>${preamble}</div><hr><div>${input.body}</div>`;
}

function angleMessageId(value: string): string {
  const cleaned = safeHeader(value);
  if (cleaned.startsWith("<") && cleaned.endsWith(">")) return cleaned;
  return `<${cleaned.replace(/^<|>$/g, "")}>`;
}

export async function buildForwardedMessage(input: {
  original: OriginalEmail;
  mailboxEmail: string;
  company: string;
  responsible: string;
  destinationEmail: string;
  senderEmail: string;
}): Promise<Buffer> {
  const sender = input.original.sender.trim() || "unknown";
  const recipient = input.original.recipient.trim() || input.mailboxEmail;
  const originalDate = input.original.originalDate.trim() || "unknown";
  let plainSource = input.original.plainBody.trim();
  if (!plainSource && input.original.htmlBody.trim()) plainSource = htmlToText(input.original.htmlBody);
  let htmlSource = htmlFragment(input.original.htmlBody.trim());
  if (!htmlSource && plainSource) htmlSource = `<pre>${escapeHtml(plainSource)}</pre>`;

  const headers: Record<string, string> = {
    "X-Source-Mailbox": safeHeader(input.mailboxEmail),
    "X-Company": safeHeader(input.company),
    "X-Responsible": safeHeader(input.responsible),
  };
  if (input.original.originalMessageId) {
    headers["X-Original-Message-ID"] = angleMessageId(input.original.originalMessageId);
  }

  const attachments = input.original.attachments.map((item) => toMailAttachment(item));
  const composer = new MailComposer({
    from: safeHeader(input.senderEmail),
    to: safeHeader(input.destinationEmail),
    subject: prefixedSubject(input.company, input.mailboxEmail, input.original.subject),
    messageId: `<${randomUUID()}@mail-forwarder>`,
    replyTo: sender.includes("@") ? safeHeader(sender) : undefined,
    headers,
    text: metadataPlain({
      mailboxEmail: input.mailboxEmail,
      sender,
      recipient,
      originalDate,
      company: input.company,
      responsible: input.responsible,
      body: plainSource,
    }),
    html: metadataHtml({
      mailboxEmail: input.mailboxEmail,
      sender,
      recipient,
      originalDate,
      company: input.company,
      responsible: input.responsible,
      body: htmlSource,
    }),
    attachments,
  });

  return new Promise((resolve, reject) => {
    composer.compile().build((error, message) => {
      if (error) reject(error);
      else resolve(message);
    });
  });
}

function toMailAttachment(item: Attachment) {
  const cid = (item.contentId || "").trim().replace(/^<|>$/g, "");
  return {
    filename: item.filename || (item.inline ? "inline.bin" : "attachment.bin"),
    content: item.data,
    contentType: item.contentType || "application/octet-stream",
    cid: item.inline && cid ? cid : undefined,
    contentDisposition: item.inline ? "inline" : "attachment",
  };
}
