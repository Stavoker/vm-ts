import { describe, expect, it } from "vitest";
import { buildForwardedMessage, prefixedSubject } from "@/lib/mail-forwarder/forward-message";

describe("buildForwardedMessage", () => {
  it("prefixes the subject and keeps metadata in both bodies", async () => {
    const raw = await buildForwardedMessage({
      mailboxEmail: "info@playworldhub.com",
      company: "Playworldhub",
      responsible: "Rostyslav",
      destinationEmail: "legal@todapay.com",
      senderEmail: "legal@todapay.com",
      original: {
        sender: "Alice <alice@customer.test>",
        recipient: "info@playworldhub.com",
        subject: "Account verification required",
        plainBody: "Please verify the account.",
        htmlBody: "<html><body><p>Please verify the account.</p></body></html>",
        originalDate: "Wed, 27 Mar 2024 17:22:37 +0000",
        originalMessageId: "<verify-1@customer.test>",
        attachments: [
          {
            filename: "verify.pdf",
            contentType: "application/pdf",
            data: Buffer.from("%PDF-test"),
            contentId: null,
            inline: false,
          },
        ],
      },
    });
    const text = raw.toString("utf8").replace(/\r\n/g, "\n");
    expect(prefixedSubject("Playworldhub", "info@playworldhub.com", "Account verification required")).toBe(
      "[Playworldhub] info@playworldhub.com — Account verification required",
    );
    expect(text).toContain("Playworldhub");
    expect(text).toContain("info@playworldhub.com");
    expect(text).toContain("Account_verification");
    expect(text).toContain("X-Source-Mailbox: info@playworldhub.com");
    expect(text).toContain("X-Company: Playworldhub");
    expect(text).toContain("X-Responsible: Rostyslav");
    expect(text).toContain("X-Original-Message-ID: <verify-1@customer.test>");
    expect(text).toContain("Reply-To: Alice <alice@customer.test>");
    expect(text).toContain("Forwarded from: info@playworldhub.com");
    expect(text).toContain("Original sender: Alice <alice@customer.test>");
    expect(text).toContain("Please verify the account.");
    expect(text).toContain("filename=verify.pdf");
  });

  it("escapes HTML from the original sender", async () => {
    const raw = await buildForwardedMessage({
      mailboxEmail: "info@playworldhub.com",
      company: "Playworldhub",
      responsible: "Rostyslav",
      destinationEmail: "legal@todapay.com",
      senderEmail: "legal@todapay.com",
      original: {
        sender: "<script>alert(1)</script> <alice@customer.test>",
        recipient: "info@playworldhub.com",
        subject: "Hi",
        plainBody: "body",
        htmlBody: "",
        originalDate: "now",
        originalMessageId: null,
        attachments: [],
      },
    });
    const html = raw.toString("utf8");
    expect(html).toContain("&lt;script&gt;alert(1)");
    expect(html).not.toMatch(/<p><strong>Original sender:<\/strong> <script>/);
  });
});
