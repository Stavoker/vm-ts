import nodemailer from "nodemailer";
import { SendError } from "@/lib/mail-forwarder/errors";

export class SmtpSender {
  constructor(
    private readonly input: {
      host: string;
      port: number;
      username: string;
      password: string;
    },
  ) {}

  async check(): Promise<void> {
    const transport = this.transport();
    try {
      await transport.verify();
    } catch (error) {
      throw wrapSmtp(error);
    } finally {
      transport.close();
    }
  }

  async send(rawMessage: Buffer): Promise<string> {
    const transport = this.transport();
    try {
      await transport.sendMail({
        envelope: undefined,
        raw: rawMessage,
      });
      return "smtp";
    } catch (error) {
      throw wrapSmtp(error);
    } finally {
      transport.close();
    }
  }

  private transport() {
    return nodemailer.createTransport({
      host: this.input.host,
      port: this.input.port,
      secure: this.input.port === 465,
      requireTLS: this.input.port === 587,
      auth: { user: this.input.username, pass: this.input.password },
    });
  }
}

function wrapSmtp(error: unknown): SendError {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("auth")) return new SendError("SMTP authentication failed");
  if (message.includes("enotfound") || message.includes("econn") || message.includes("etimedout")) {
    return new SendError("SMTP send failed (network error)");
  }
  return new SendError(`SMTP send failed (${error instanceof Error ? error.name : "error"})`);
}
