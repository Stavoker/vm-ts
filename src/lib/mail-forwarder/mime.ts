import { simpleParser } from "mailparser";
import type { Attachment, OriginalEmail } from "@/lib/mail-forwarder/types";

const BODY_RE = /<body[^>]*>([\s\S]*)<\/body>/i;
const SCRIPT_RE = /<(script|style)[\s\S]*?>[\s\S]*?<\/\1>/gi;
const BR_RE = /<br\s*\/?>/gi;
const BLOCK_RE = /<\/p>|<\/div>|<\/tr>|<\/h[1-6]>/gi;
const TAG_RE = /<[^>]+>/g;

export type ParsedMime = {
  sender: string;
  recipient: string;
  subject: string;
  date: string;
  messageId: string;
  plain: string;
  html: string;
  attachments: Attachment[];
};

export function emptyMime(): ParsedMime {
  return {
    sender: "",
    recipient: "",
    subject: "",
    date: "",
    messageId: "",
    plain: "",
    html: "",
    attachments: [],
  };
}

export async function parseMime(raw: string): Promise<ParsedMime> {
  const parsed = await simpleParser(raw);
  const attachments: Attachment[] = [];
  for (const item of parsed.attachments || []) {
    const disposition = String(item.contentDisposition || "").toLowerCase();
    const contentId = item.cid ? String(item.cid) : null;
    const filename = safeFilename(item.filename, `attachment-${attachments.length + 1}.bin`);
    attachments.push({
      filename,
      contentType: item.contentType || "application/octet-stream",
      data: Buffer.isBuffer(item.content) ? item.content : Buffer.from(item.content || []),
      contentId,
      inline: disposition === "inline" || Boolean(contentId),
    });
  }
  return {
    sender: header(parsed.from?.text),
    recipient: header(parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((item) => item.text).join(", ") : parsed.to.text) : ""),
    subject: header(parsed.subject),
    date: parsed.date ? parsed.date.toUTCString() : "",
    messageId: header(parsed.messageId),
    plain: parsed.text || "",
    html: typeof parsed.html === "string" ? parsed.html : "",
    attachments,
  };
}

export function htmlFragment(originalHtml: string): string {
  if (!originalHtml) return "";
  const match = originalHtml.match(BODY_RE);
  return match ? match[1].trim() : originalHtml;
}

export function htmlToText(originalHtml: string): string {
  let text = originalHtml.replace(SCRIPT_RE, " ").replace(BR_RE, "\n").replace(BLOCK_RE, "\n").replace(TAG_RE, "");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  const collapsed: string[] = [];
  let blank = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      if (!blank && collapsed.length) collapsed.push("");
      blank = true;
      continue;
    }
    collapsed.push(line.trim());
    blank = false;
  }
  return collapsed.join("\n").trim();
}

export function safeFilename(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback;
  const cleaned = name.replace(/\\/g, "/").replace(/\0/g, "");
  const base = cleaned.split("/").pop() || "";
  const stripped = base.replace(/[\r\n]/g, "").trim();
  if (!stripped || stripped === "." || stripped === "..") return fallback;
  return stripped.slice(0, 200);
}

function header(value: string | undefined | null): string {
  return (value || "").trim();
}

export function toOriginalEmail(parsed: ParsedMime, fallback: Partial<OriginalEmail> = {}): OriginalEmail {
  return {
    sender: parsed.sender || fallback.sender || "",
    recipient: parsed.recipient || fallback.recipient || "",
    subject: parsed.subject || fallback.subject || "",
    plainBody: parsed.plain || fallback.plainBody || "",
    htmlBody: parsed.html || fallback.htmlBody || "",
    originalDate: parsed.date || fallback.originalDate || "unknown",
    originalMessageId: parsed.messageId || fallback.originalMessageId || null,
    attachments: parsed.attachments,
  };
}
