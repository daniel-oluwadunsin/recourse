import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";

import {
  AuditEventType,
  AuditOutcome,
} from "../audit/schemas/audit-log.schema";
import { AuditLogService } from "../audit/audit.service";
import { QueueProducerService } from "../queues/queue-producer.service";
import { Case } from "../cases/schemas/case.schema";
import { User } from "../users/schemas/user.schema";
import { EMAIL_PROVIDER, type EmailProvider } from "./email.types";
import { UsageBudgetService } from "../../common/security/usage-budget.service";
import { CaseEmailTokenService } from "./case-email-token.service";
import {
  OutboundEmail,
  type OutboundEmailDocument,
} from "./schemas/outbound-email.schema";

@Injectable()
export class EmailService {
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    @InjectModel(OutboundEmail.name)
    private readonly outboundModel: Model<OutboundEmail>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly queueProducer: QueueProducerService,
    private readonly audit: AuditLogService,
    private readonly tokens: CaseEmailTokenService,
    @Optional() private readonly budget?: UsageBudgetService,
  ) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  createCaseReplyTo(ownerId: string, caseId: string): Promise<string> {
    return this.tokens.create(ownerId, caseId);
  }

  async sendSecurityEmail(input: {
    userId: string;
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<void> {
    if (!isSafeAddress(input.to)) {
      throw new ConflictException("Outbound email recipient is invalid.");
    }
    if (!this.provider.isConfigured()) {
      throw new ServiceUnavailableException(
        "Transactional email is unavailable until Gmail is configured.",
      );
    }
    if (this.budget) await this.budget.consumeOutboundEmail(input.userId);
    try {
      const result = await this.provider.send({
        fromName: this.config.get("EMAIL_FROM_NAME") ?? "Recourse",
        idempotencyKey: input.idempotencyKey,
        replyTo: null,
        subject: input.subject,
        text: input.text,
        to: input.to,
      });
      if (!result.accepted || !result.providerMessageId) {
        throw new ServiceUnavailableException(
          "The email provider did not confirm acceptance.",
        );
      }
      await this.audit.record(
        AuditEventType.EMAIL_OUTBOUND_ACCEPTED,
        { userId: input.userId },
        AuditOutcome.SUCCESS,
        { providerMessageId: result.providerMessageId, purpose: "SECURITY" },
      );
    } catch (error: unknown) {
      await this.audit.record(
        AuditEventType.EMAIL_OUTBOUND_FAILED,
        { userId: input.userId },
        AuditOutcome.FAILURE,
        { purpose: "SECURITY" },
        "SECURITY_EMAIL_FAILED",
      );
      throw error;
    }
  }

  async createOutbound(input: {
    ownerId?: string | null;
    caseId?: string | null;
    to: string;
    subject: string;
    text: string;
    replyTo?: string | null;
    idempotencyKey: string;
  }): Promise<OutboundEmailDocument> {
    const existing = await this.outboundModel
      .findOne({ idempotencyKey: input.idempotencyKey })
      .exec();
    if (existing) return existing;
    if (!isSafeAddress(input.to)) {
      throw new ConflictException("Outbound email recipient is invalid.");
    }
    if (input.ownerId && this.budget) {
      await this.budget.consumeOutboundEmail(input.ownerId);
    }
    if (!this.provider.isConfigured()) {
      throw new ServiceUnavailableException(
        "Transactional email is unavailable until Gmail is configured.",
      );
    }
    const created = await this.outboundModel.create({
      attempts: 0,
      bodyText: input.text.slice(0, 100000),
      caseId: input.caseId ? new Types.ObjectId(input.caseId) : null,
      failureCode: null,
      failureMessage: null,
      idempotencyKey: input.idempotencyKey,
      ownerId: input.ownerId ? new Types.ObjectId(input.ownerId) : null,
      providerMessageId: null,
      replyTo: input.replyTo ?? null,
      status: "QUEUED",
      subject: input.subject.slice(0, 500),
      toAddress: input.to,
    });
    await this.queueProducer.enqueueNotification({
      correlationId: null,
      deadlineId: null,
      idempotencyKey: `outbound-email-${created._id.toString()}`,
      kind: "OUTBOUND_EMAIL",
      notificationId: null,
      outboundEmailId: created._id.toString(),
      workflowVersion: "phase-10-v1",
    });
    return created;
  }

  async deliver(outboundId: string): Promise<OutboundEmailDocument> {
    const outbound = await this.outboundModel.findById(outboundId).exec();
    if (!outbound) throw new NotFoundException("Outbound email not found.");
    if (outbound.status === "PROVIDER_ACCEPTED") return outbound;
    if (outbound.status === "UNKNOWN") {
      throw new ConflictException(
        "Outbound email delivery is indeterminate and requires manual verification.",
      );
    }
    const leased = await this.outboundModel
      .findOneAndUpdate(
        { _id: outbound._id, status: "QUEUED" },
        { $inc: { attempts: 1 }, $set: { status: "SENDING" } },
        { returnDocument: "after" },
      )
      .exec();
    if (!leased)
      return (await this.outboundModel
        .findById(outbound._id)
        .exec()) as OutboundEmailDocument;
    try {
      const result = await this.provider.send({
        fromName: this.config.get("EMAIL_FROM_NAME") ?? "Recourse",
        idempotencyKey: leased.idempotencyKey,
        replyTo: leased.replyTo,
        subject: leased.subject,
        text: leased.bodyText,
        to: leased.toAddress,
      });
      const accepted = await this.outboundModel
        .findOneAndUpdate(
          { _id: leased._id, status: "SENDING" },
          {
            $set: {
              failureCode: null,
              failureMessage: null,
              providerMessageId: result.providerMessageId,
              status: result.accepted ? "PROVIDER_ACCEPTED" : "FAILED",
            },
          },
          { returnDocument: "after" },
        )
        .exec();
      if (!accepted)
        throw new ConflictException("Outbound email state changed.");
      await this.audit.record(
        result.accepted
          ? AuditEventType.EMAIL_OUTBOUND_ACCEPTED
          : AuditEventType.EMAIL_OUTBOUND_FAILED,
        { userId: leased.ownerId?.toString() },
        result.accepted ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
        {
          caseId: leased.caseId?.toString() ?? null,
          providerMessageId: result.providerMessageId,
        },
      );
      return accepted;
    } catch (error) {
      await this.outboundModel
        .updateOne(
          { _id: leased._id, status: "SENDING" },
          {
            $set: {
              failureCode: "SMTP_UNKNOWN",
              failureMessage: "The provider result could not be confirmed.",
              status: "UNKNOWN",
            },
          },
        )
        .exec();
      await this.audit.record(
        AuditEventType.EMAIL_OUTBOUND_FAILED,
        { userId: leased.ownerId?.toString() },
        AuditOutcome.FAILURE,
        { caseId: leased.caseId?.toString() ?? null },
        "SMTP_UNKNOWN",
      );
      throw error;
    }
  }

  async createOwnerNotificationEmail(input: {
    ownerId: string;
    caseId: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<OutboundEmailDocument> {
    const owner = await this.userModel
      .findById(input.ownerId)
      .select({ email: 1 })
      .exec();
    const caseDocument = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(input.caseId),
        ownerId: new Types.ObjectId(input.ownerId),
        deletedAt: null,
      })
      .select({ _id: 1 })
      .exec();
    if (!owner || !caseDocument) throw new NotFoundException("Case not found.");
    return this.createOutbound({
      caseId: input.caseId,
      idempotencyKey: input.idempotencyKey,
      ownerId: input.ownerId,
      subject: input.subject,
      text: input.text,
      to: owner.email,
    });
  }

  async health(): Promise<{
    status: "ok" | "unconfigured" | "error";
    message?: string;
  }> {
    return this.provider.verifyConnection();
  }
}

function isSafeAddress(value: string): boolean {
  return (
    value.length <= 320 &&
    !/[\r\n\0]/u.test(value) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
  );
}
