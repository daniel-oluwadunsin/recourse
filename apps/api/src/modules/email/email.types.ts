export interface OutboundEmailMessage {
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  fromName: string;
}

export interface EmailSendResult {
  accepted: boolean;
  providerMessageId: string | null;
}

export interface InboundEmailMessage {
  providerMessageId: string;
  internetMessageId: string | null;
  from: string;
  to: string[];
  subject: string | null;
  text: string;
  attachmentCount: number;
  receivedAt: Date;
}

export interface EmailProvider {
  isConfigured(): boolean;
  send(message: OutboundEmailMessage): Promise<EmailSendResult>;
  verifyConnection(): Promise<{
    status: "ok" | "unconfigured" | "error";
    message?: string;
  }>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  parseInbound(
    rawBody: Buffer,
    providerMessageId: string,
    receivedAt?: Date,
  ): Promise<InboundEmailMessage>;
  pollInbound(
    handler: (message: InboundEmailMessage) => Promise<void>,
  ): Promise<number>;
}

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");
