import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { Connection, Model, Types } from "mongoose";

import {
  AuditEventType,
  AuditOutcome,
} from "../audit/schemas/audit-log.schema";
import { AuditLogService } from "../audit/audit.service";
import { type EnvironmentConfig } from "@recourse/config";
import { CaseEventService } from "../cases/case-events.service";
import { Case } from "../cases/schemas/case.schema";
import { EvidenceService } from "../evidence/evidence.service";
import {
  EMAIL_PROVIDER,
  type EmailProvider,
  type InboundEmailMessage,
} from "./email.types";
import { CaseEmailTokenService } from "./case-email-token.service";
import {
  CaseResponse,
  type CaseResponseDocument,
} from "./schemas/case-response.schema";
import { InboundEmail } from "./schemas/inbound-email.schema";

const signedWebhookPayloadSchema = z.object({
  attachmentCount: z.number().int().nonnegative().max(100).default(0),
  from: z.string().email().max(320),
  internetMessageId: z.string().max(500).nullable().default(null),
  providerMessageId: z.string().min(1).max(500),
  receivedAt: z.coerce.date().default(new Date()),
  subject: z.string().max(500).nullable().default(null),
  text: z.string().max(500000),
  to: z.array(z.string().email().max(320)).max(50),
});

@Injectable()
export class EmailInboundService {
  private lastPollAt = 0;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(CaseResponse.name)
    private readonly responseModel: Model<CaseResponse>,
    @InjectModel(InboundEmail.name)
    private readonly inboundModel: Model<InboundEmail>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly tokens: CaseEmailTokenService,
    private readonly evidence: EvidenceService,
    private readonly events: CaseEventService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService<EnvironmentConfig>,
  ) {}

  async handleSignedWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ accepted: boolean; responseId: string | null }> {
    const maxBytes = this.config.get("EMAIL_MAX_BODY_BYTES") ?? 500000;
    if (rawBody.byteLength > maxBytes) {
      throw new BadRequestException("Inbound email payload is too large.");
    }
    if (!this.provider.verifyWebhook(rawBody, signature)) {
      await this.audit.record(
        AuditEventType.EMAIL_INBOUND_REJECTED,
        {},
        AuditOutcome.FAILURE,
        {},
        "INVALID_EMAIL_SIGNATURE",
      );
      throw new BadRequestException("Inbound email signature is invalid.");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as unknown;
    } catch {
      throw new BadRequestException("Inbound email payload is invalid.");
    }
    let parsed: z.infer<typeof signedWebhookPayloadSchema>;
    try {
      parsed = signedWebhookPayloadSchema.parse(payload);
    } catch {
      throw new BadRequestException("Inbound email payload is invalid.");
    }
    return this.ingest(parsed);
  }

  async ingest(
    message: InboundEmailMessage,
  ): Promise<{ accepted: boolean; responseId: string | null }> {
    const existing = await this.inboundModel
      .findOne({ providerMessageId: message.providerMessageId })
      .exec();
    if (existing) {
      return {
        accepted: existing.associationStatus === "ASSOCIATED",
        responseId: existing.responseId?.toString() ?? null,
      };
    }

    const association = await this.tokens.resolve(message.to);
    if (!association) {
      await this.inboundModel.create({
        associationStatus: "UNRELATED",
        caseId: null,
        internetMessageId: message.internetMessageId,
        providerMessageId: message.providerMessageId,
        receivedAt: message.receivedAt,
        responseId: null,
      });
      return { accepted: false, responseId: null };
    }

    const activeCase = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(association.caseId),
        deletedAt: null,
        ownerId: new Types.ObjectId(association.ownerId),
      })
      .select({ _id: 1 })
      .exec();
    if (!activeCase) {
      await this.inboundModel.create({
        associationStatus: "UNRELATED",
        caseId: null,
        internetMessageId: message.internetMessageId,
        providerMessageId: message.providerMessageId,
        receivedAt: message.receivedAt,
        responseId: null,
      });
      return { accepted: false, responseId: null };
    }

    const evidenceId = await this.evidence.createInboundTextEvidence(
      association.ownerId,
      association.caseId,
      {
        providerMessageId: message.providerMessageId,
        receivedAt: message.receivedAt,
        text: message.text,
      },
    );
    const response = await this.connection.transaction(async (session) => {
      const created = await this.responseModel.create(
        [
          {
            addressedClaimIds: [],
            analyzedAt: null,
            associationStatus: "ASSOCIATED",
            attachmentCount: message.attachmentCount,
            bodyText: message.text.slice(0, 500000),
            caseId: activeCase._id,
            evidenceId: new Types.ObjectId(evidenceId),
            fromAddress: message.from,
            internetMessageId: message.internetMessageId,
            mentionedDeadlines: [],
            newIssues: [],
            outcome: null,
            outcomeConfidence: null,
            ownerId: new Types.ObjectId(association.ownerId),
            processingStatus: "RECEIVED",
            providerMessageId: message.providerMessageId,
            replanNextAction: null,
            replanRationale: null,
            replanRunId: null,
            recommendedOutcome: null,
            receivedAt: message.receivedAt,
            requestedEvidence: [],
            revision: 0,
            statedReason: null,
            subject: message.subject,
            toAddresses: message.to,
            unaddressedClaimIds: [],
          },
        ],
        { session },
      );
      const item = created[0];
      if (!item) throw new Error("Response creation returned no document.");
      await this.inboundModel.create(
        [
          {
            associationStatus: "ASSOCIATED",
            caseId: activeCase._id,
            internetMessageId: message.internetMessageId,
            providerMessageId: message.providerMessageId,
            receivedAt: message.receivedAt,
            responseId: item._id,
          },
        ],
        { session },
      );
      await this.events.appendInSession(
        {
          actor: { actorId: null, actorType: "EXTERNAL" },
          caseId: association.caseId,
          idempotencyKey: `response-received-${message.providerMessageId}`,
          payload: {
            attachmentCount: message.attachmentCount,
            evidenceId,
            responseId: item._id.toString(),
          },
          type: "RESPONSE_RECEIVED",
        },
        session,
      );
      return item;
    });
    await this.audit.record(
      AuditEventType.EMAIL_INBOUND_ACCEPTED,
      { userId: association.ownerId },
      AuditOutcome.SUCCESS,
      { caseId: association.caseId, responseId: response._id.toString() },
    );
    return { accepted: true, responseId: response._id.toString() };
  }

  async pollGmail(): Promise<number> {
    const interval = this.config.get("EMAIL_INBOUND_POLL_INTERVAL_MS") ?? 60000;
    if (Date.now() - this.lastPollAt < interval) return 0;
    this.lastPollAt = Date.now();
    return this.provider.pollInbound((message) =>
      this.ingest(message).then(() => undefined),
    );
  }

  async list(ownerId: string, caseId: string): Promise<CaseResponseDocument[]> {
    const exists = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(caseId),
        deletedAt: null,
        ownerId: new Types.ObjectId(ownerId),
      })
      .select({ _id: 1 })
      .exec();
    if (!exists) throw new NotFoundException("Case not found.");
    return this.responseModel
      .find({
        caseId: exists._id,
        ownerId: new Types.ObjectId(ownerId),
      })
      .sort({ receivedAt: -1, _id: -1 })
      .exec();
  }
}
