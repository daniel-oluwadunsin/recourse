import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

import { type SubmissionCapability } from "@recourse/contracts";

import { EmailService } from "../../email/email.service";

import {
  type ActionAdapter,
  type ActionExecutionResult,
  type ActionVerificationResult,
  type PreparedAction,
} from "../appeal.types";
import { type CaseActionDocument } from "../schemas/case-action.schema";
import { Appeal } from "../schemas/appeal.schema";

@Injectable()
export class EmailActionAdapter implements ActionAdapter {
  readonly name = "gmail-smtp";

  constructor(
    private readonly email: EmailService,
    @InjectModel(Appeal.name) private readonly appealModel: Model<Appeal>,
  ) {}

  capability(): SubmissionCapability {
    return "EMAIL";
  }

  async prepare(action: CaseActionDocument): Promise<PreparedAction> {
    if (!this.email.isConfigured()) {
      throw new ServiceUnavailableException(
        "Gmail email submission is unavailable.",
      );
    }
    const destination = readString(action.recommendation.officialDestination);
    const recipient = parseMailto(destination);
    if (!recipient) {
      throw new ServiceUnavailableException(
        "Email submission requires a verified mailto destination.",
      );
    }
    if (!action.appealId) throw new NotFoundException("Appeal not found.");
    const appeal = await this.appealModel.findById(action.appealId).exec();
    if (!appeal) throw new NotFoundException("Appeal not found.");
    const replyTo = await this.email.createCaseReplyTo(
      action.ownerId.toString(),
      action.caseId.toString(),
    );
    return {
      actionId: action._id.toString(),
      adapterName: this.name,
      capability: "EMAIL",
      canExecute: true,
      destination,
      instructions: [
        "Gmail SMTP provider acceptance will be recorded; institution response remains a separate event.",
      ],
      payload: {
        body: appeal.renderedBody,
        caseId: action.caseId.toString(),
        ownerId: action.ownerId.toString(),
        replyTo,
        subject: appeal.title,
        to: recipient,
      },
      payloadHash: action.payloadHash,
    };
  }

  async execute(
    prepared: PreparedAction,
    idempotencyKey: string,
  ): Promise<ActionExecutionResult> {
    const payload = prepared.payload;
    const outbound = await this.email.createOutbound({
      caseId: readString(payload.caseId),
      idempotencyKey: `action-email-${idempotencyKey}`,
      ownerId: readString(payload.ownerId),
      replyTo: readString(payload.replyTo),
      subject: readString(payload.subject) ?? "Recourse appeal",
      text: readString(payload.body) ?? "",
      to: readString(payload.to) ?? "",
    });
    const delivered = await this.email.deliver(outbound._id.toString());
    return {
      acceptedAt: delivered.updatedAt ?? new Date(),
      actionId: prepared.actionId,
      capability: "EMAIL",
      providerReference: delivered.providerMessageId,
      rawStatus: delivered.status,
    };
  }

  async verify(
    result: ActionExecutionResult,
  ): Promise<ActionVerificationResult> {
    const verified =
      result.rawStatus === "PROVIDER_ACCEPTED" &&
      Boolean(result.providerReference);
    return {
      explanation: verified
        ? "Gmail accepted the outbound SMTP message. This does not establish institution receipt or case resolution."
        : "Gmail did not provide a confirmed provider acceptance.",
      providerReference: result.providerReference,
      verified,
    };
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseMailto(value: string | null): string | null {
  if (!value?.toLowerCase().startsWith("mailto:")) return null;
  const recipient = value
    .slice("mailto:".length)
    .split("?")[0]
    ?.trim()
    .toLowerCase();
  return recipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient)
    ? recipient
    : null;
}
