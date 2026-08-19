import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { Types } from "mongoose";

import { deadlineStatusSchema } from "@recourse/contracts";
import { stableJobId } from "../queues/queue.constants";
import { nextStatusForReplan } from "../ai/ai-job.service";
import { addRelative } from "./deadline.service";
import { EmailInboundService } from "./email-inbound.service";
import { GmailEmailProvider } from "./gmail.provider";

describe("Phase 10 email and response safety boundaries", () => {
  it("accepts only a valid signed webhook and is replay-idempotent", async () => {
    const secret = "a".repeat(32);
    const rawBody = Buffer.from(
      JSON.stringify({
        attachmentCount: 0,
        from: "platform@example.com",
        internetMessageId: "<message-1@example.com>",
        providerMessageId: "gateway-message-1",
        receivedAt: new Date().toISOString(),
        subject: "Decision response",
        text: "We received your request.",
        to: ["case+opaque-token-1234567890@example.com"],
      }),
    );
    const provider = new GmailEmailProvider(
      new ConfigService({
        EMAIL_PROVIDER: "none",
        EMAIL_WEBHOOK_SECRET: secret,
      }) as never,
    );
    const signature = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    const inboundModel = {
      findOne: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue({
          associationStatus: "ASSOCIATED",
          responseId: new Types.ObjectId(),
        }),
      })),
    };
    const service = new EmailInboundService(
      undefined as never,
      undefined as never,
      inboundModel as never,
      undefined as never,
      provider,
      undefined as never,
      undefined as never,
      undefined as never,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
      new ConfigService({ EMAIL_MAX_BODY_BYTES: 500000 }) as never,
    );
    await expect(
      service.handleSignedWebhook(rawBody, signature),
    ).resolves.toEqual(expect.objectContaining({ accepted: true }));
    await expect(
      service.handleSignedWebhook(rawBody, "bad-signature"),
    ).rejects.toThrow("signature is invalid");
    expect(inboundModel.findOne).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed signed webhook payloads as client errors", async () => {
    const secret = "b".repeat(32);
    const rawBody = Buffer.from('{"providerMessageId":"missing-fields"}');
    const provider = new GmailEmailProvider(
      new ConfigService({
        EMAIL_PROVIDER: "none",
        EMAIL_WEBHOOK_SECRET: secret,
      }) as never,
    );
    const service = new EmailInboundService(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      provider,
      undefined as never,
      undefined as never,
      undefined as never,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
      new ConfigService({ EMAIL_MAX_BODY_BYTES: 500000 }) as never,
    );
    const signature = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    await expect(
      service.handleSignedWebhook(rawBody, signature),
    ).rejects.toThrow("payload is invalid");
  });

  it("does not associate unrelated mail and does not expose a case lookup", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const service = new EmailInboundService(
      undefined as never,
      undefined as never,
      {
        findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(null) })),
        create,
      } as never,
      undefined as never,
      undefined as never,
      { resolve: vi.fn().mockResolvedValue(null) } as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    const result = await service.ingest({
      attachmentCount: 0,
      from: "unknown@example.com",
      internetMessageId: null,
      providerMessageId: "unrelated-1",
      receivedAt: new Date(),
      subject: "Hello",
      text: "Unrelated content",
      to: ["support@example.com"],
    });
    expect(result).toEqual({ accepted: false, responseId: null });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ associationStatus: "UNRELATED" }),
    );
  });

  it("keeps deadline source conflicts explicit and applies business-day rules deterministically", () => {
    const friday = new Date("2026-08-21T09:00:00.000Z");
    expect(addRelative(friday, 1, "DAYS", "BUSINESS_DAYS").toISOString()).toBe(
      "2026-08-24T09:00:00.000Z",
    );
    expect(
      addRelative(
        new Date("2026-03-07T14:00:00.000Z"),
        1,
        "DAYS",
        "CALENDAR_DAYS",
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z");
    expect(deadlineStatusSchema.parse("CONFLICTED")).toBe("CONFLICTED");
  });

  it("does not close a case from an ambiguous or unsupported positive response", () => {
    const response = {
      newIssues: [],
      outcome: "APPROVED" as const,
      outcomeConfidence: 0.95,
      requestedEvidence: [],
    };
    expect(
      nextStatusForReplan(response as never, "CLOSE_RESOLVED", false),
    ).toBe("RESOLVED");
    expect(
      nextStatusForReplan(
        { ...response, newIssues: [{ text: "Unclear scope" }] } as never,
        "CLOSE_RESOLVED",
        false,
      ),
    ).toBe("NEEDS_HUMAN");
    expect(nextStatusForReplan(response as never, "CLOSE_RESOLVED", true)).toBe(
      "NEEDS_HUMAN",
    );
  });

  it("uses deterministic reminder job IDs so delayed reminder retries do not duplicate work", () => {
    const first = stableJobId(
      "notification",
      "deadline-reminder-deadline-1-2026-08-24T09.00.00.000Z",
    );
    const second = stableJobId(
      "notification",
      "deadline-reminder-deadline-1-2026-08-24T09.00.00.000Z",
    );
    expect(first).toBe(second);
    expect(first).not.toContain(":");
  });
});
