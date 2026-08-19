import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import nodemailer, { type Transporter } from "nodemailer";
import PostalMime from "postal-mime";
import sanitizeHtml from "sanitize-html";

import { type EnvironmentConfig } from "@recourse/config";

import {
  type EmailProvider,
  type EmailSendResult,
  type InboundEmailMessage,
  type OutboundEmailMessage,
} from "./email.types";

interface ParsedAddress {
  address?: string;
}

interface ParsedMail {
  messageId?: string;
  from?: ParsedAddress | ParsedAddress[];
  to?: ParsedAddress | ParsedAddress[];
  subject?: string;
  text?: string;
  html?: string;
  date?: string;
  attachments?: Array<{
    content: ArrayBuffer | Uint8Array | string;
    encoding?: "base64" | "utf8";
  }>;
}

@Injectable()
export class GmailEmailProvider implements EmailProvider {
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService<EnvironmentConfig>) {}

  isConfigured(): boolean {
    return (
      this.config.get("EMAIL_PROVIDER") === "gmail" &&
      Boolean(
        this.config.get("GMAIL_EMAIL") && this.config.get("GMAIL_APP_PASSWORD"),
      )
    );
  }

  async send(message: OutboundEmailMessage): Promise<EmailSendResult> {
    this.assertConfigured();
    const user = this.config.getOrThrow("GMAIL_EMAIL");
    const messageId = `<recourse-${createHash("sha256")
      .update(message.idempotencyKey)
      .digest("hex")
      .slice(0, 32)}@${user.split("@")[1] ?? "localhost"}>`;
    const info = await this.transporterFor().sendMail({
      from: `${this.config.get("EMAIL_FROM_NAME") ?? "Recourse"} <${user}>`,
      headers: {
        "Message-ID": messageId,
        "X-Recourse-Idempotency": message.idempotencyKey,
      },
      replyTo: message.replyTo ?? undefined,
      subject: message.subject,
      text: message.text,
      to: message.to,
    });
    return {
      accepted: info.accepted.length > 0,
      providerMessageId: info.messageId ?? messageId,
    };
  }

  async verifyConnection(): Promise<{
    status: "ok" | "unconfigured" | "error";
    message?: string;
  }> {
    if (!this.isConfigured()) {
      return { message: "Gmail is not configured.", status: "unconfigured" };
    }
    try {
      await this.transporterFor().verify();
      return { status: "ok" };
    } catch {
      return { message: "Gmail SMTP verification failed.", status: "error" };
    }
  }

  async verifyImapConnection(): Promise<{
    status: "ok" | "unconfigured" | "error";
    message?: string;
  }> {
    if (!this.isConfigured()) {
      return { message: "Gmail is not configured.", status: "unconfigured" };
    }
    const client = new ImapFlow({
      auth: {
        pass: this.config.getOrThrow("GMAIL_APP_PASSWORD"),
        user: this.config.getOrThrow("GMAIL_EMAIL"),
      },
      host: this.config.get("GMAIL_IMAP_HOST") ?? "imap.gmail.com",
      logger: false,
      port: this.config.get("GMAIL_IMAP_PORT") ?? 993,
      secure: this.config.get("GMAIL_IMAP_SECURE") ?? true,
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock(
        this.config.get("GMAIL_IMAP_MAILBOX") ?? "INBOX",
        { readOnly: true },
      );
      lock.release();
      await client.logout();
      return { status: "ok" };
    } catch {
      await client.logout().catch(() => undefined);
      return { message: "Gmail IMAP verification failed.", status: "error" };
    }
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    const secret = this.config.get("EMAIL_WEBHOOK_SECRET");
    if (!secret || !signature) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const supplied = signature.replace(/^sha256=/u, "");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const suppliedBuffer = Buffer.from(supplied, "utf8");
    return (
      expectedBuffer.length === suppliedBuffer.length &&
      timingSafeEqual(expectedBuffer, suppliedBuffer)
    );
  }

  async parseInbound(
    rawBody: Buffer,
    providerMessageId: string,
    receivedAt = new Date(),
  ): Promise<InboundEmailMessage> {
    const maxBytes = this.config.get("EMAIL_MAX_BODY_BYTES") ?? 500000;
    if (rawBody.byteLength > maxBytes) {
      throw new Error("Inbound email exceeds the configured body limit.");
    }
    const parsed = (await PostalMime.parse(rawBody, {
      attachmentEncoding: "arraybuffer",
      maxHeadersSize: 256 * 1024,
      maxNestingDepth: 32,
    })) as unknown as ParsedMail;
    const maxAttachmentBytes =
      this.config.get("EMAIL_MAX_ATTACHMENT_BYTES") ?? 15 * 1024 * 1024;
    for (const attachment of parsed.attachments ?? []) {
      if (contentBuffer(attachment).byteLength > maxAttachmentBytes) {
        throw new Error(
          "Inbound email attachment exceeds the configured limit.",
        );
      }
    }
    const htmlText = parsed.html ? safeHtmlToText(parsed.html) : "";
    const text = (parsed.text ?? htmlText).trim().slice(0, maxBytes);
    return {
      attachmentCount: parsed.attachments?.length ?? 0,
      from: firstAddress(parsed.from) ?? "unknown@invalid.local",
      internetMessageId: parsed.messageId ?? null,
      providerMessageId,
      receivedAt: parsed.date ? new Date(parsed.date) : receivedAt,
      subject: parsed.subject?.trim().slice(0, 500) ?? null,
      text,
      to: addresses(parsed.to),
    };
  }

  async pollInbound(
    handler: (message: InboundEmailMessage) => Promise<void>,
  ): Promise<number> {
    if (!this.isConfigured() || !this.config.get("EMAIL_INBOUND_ENABLED")) {
      return 0;
    }
    const client = new ImapFlow({
      auth: {
        pass: this.config.getOrThrow("GMAIL_APP_PASSWORD"),
        user: this.config.getOrThrow("GMAIL_EMAIL"),
      },
      host: this.config.get("GMAIL_IMAP_HOST") ?? "imap.gmail.com",
      logger: false,
      port: this.config.get("GMAIL_IMAP_PORT") ?? 993,
      secure: this.config.get("GMAIL_IMAP_SECURE") ?? true,
    });
    let processed = 0;
    await client.connect();
    const lock = await client.getMailboxLock(
      this.config.get("GMAIL_IMAP_MAILBOX") ?? "INBOX",
    );
    try {
      const mailboxName = this.config.get("GMAIL_IMAP_MAILBOX") ?? "INBOX";
      const mailbox = client.mailbox;
      const uidValidity =
        mailbox && mailbox.uidValidity
          ? String(mailbox.uidValidity)
          : "unknown";
      const uids = await client.search({ seen: false }, { uid: true });
      if (uids === false || uids.length === 0) return 0;
      const messages = await client.fetchAll(
        uids,
        { envelope: true, internalDate: true, source: true },
        { uid: true },
      );
      for (const message of messages) {
        const raw = Buffer.from(message.source as Uint8Array);
        const providerMessageId = `gmail:${mailboxName}:${uidValidity}:${String(message.uid)}`;
        const parsed = await this.parseInbound(
          raw,
          providerMessageId,
          message.internalDate instanceof Date
            ? message.internalDate
            : new Date(message.internalDate ?? Date.now()),
        );
        await handler(parsed);
        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
        processed += 1;
      }
    } finally {
      lock.release();
      await client.logout().catch(() => undefined);
    }
    return processed;
  }

  private transporterFor(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        auth: {
          pass: this.config.getOrThrow("GMAIL_APP_PASSWORD"),
          user: this.config.getOrThrow("GMAIL_EMAIL"),
        },
        pool: true,
        service: "gmail",
      });
    }
    return this.transporter;
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error("Gmail email provider is not configured.");
    }
  }
}

function firstAddress(
  value: ParsedAddress | ParsedAddress[] | undefined,
): string | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.address?.trim().toLowerCase() || null;
}

function addresses(
  value: ParsedAddress | ParsedAddress[] | undefined,
): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((item) => item.address?.trim().toLowerCase() ?? "")
    .filter((item) => item.length > 0);
}

function safeHtmlToText(html: string): string {
  return sanitizeHtml(html, {
    allowedAttributes: {},
    allowedTags: ["br", "div", "em", "li", "ol", "p", "span", "strong", "ul"],
    disallowedTagsMode: "discard",
  })
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<\/(?:div|li|p)\s*>/giu, "\n")
    .replace(/<[^>]*>/gu, "")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function contentBuffer(attachment: {
  content: ArrayBuffer | Uint8Array | string;
  encoding?: "base64" | "utf8";
}): Buffer {
  if (typeof attachment.content === "string") {
    return Buffer.from(
      attachment.content,
      attachment.encoding === "base64" ? "base64" : "utf8",
    );
  }
  return Buffer.from(
    attachment.content instanceof Uint8Array
      ? attachment.content
      : new Uint8Array(attachment.content),
  );
}
