import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import {
  AuditEventType,
  AuditOutcome,
} from "../audit/schemas/audit-log.schema";
import { AuditLogService } from "../audit/audit.service";
import { Case } from "../cases/schemas/case.schema";
import { Deadline } from "../cases/schemas/deadline.schema";
import { EmailService } from "./email.service";
import {
  Notification,
  type NotificationDocument,
} from "./schemas/notification.schema";

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Deadline.name) private readonly deadlineModel: Model<Deadline>,
    private readonly email: EmailService,
    private readonly audit: AuditLogService,
  ) {}

  async create(input: {
    ownerId: string;
    caseId?: string | null;
    type: string;
    title: string;
    body: string;
    deduplicationKey: string;
    emailSubject?: string;
    emailText?: string;
  }): Promise<NotificationDocument> {
    const existing = await this.notificationModel
      .findOne({ deduplicationKey: input.deduplicationKey })
      .exec();
    if (existing) return existing;
    const channels: Array<"IN_APP" | "EMAIL"> = ["IN_APP"];
    const created = await this.notificationModel.create({
      body: input.body.slice(0, 2000),
      caseId: input.caseId ? new Types.ObjectId(input.caseId) : null,
      channels,
      deduplicationKey: input.deduplicationKey,
      ownerId: new Types.ObjectId(input.ownerId),
      outboundEmailId: null,
      readAt: null,
      title: input.title.slice(0, 200),
      type: input.type,
    });
    await this.audit.record(
      AuditEventType.NOTIFICATION_CREATED,
      { userId: input.ownerId },
      AuditOutcome.SUCCESS,
      { caseId: input.caseId ?? null, notificationId: created._id.toString() },
    );

    if (
      this.email.isConfigured() &&
      input.emailSubject &&
      input.emailText &&
      input.caseId
    ) {
      try {
        const outbound = await this.email.createOwnerNotificationEmail({
          caseId: input.caseId,
          idempotencyKey: `notification-email-${created._id.toString()}`,
          ownerId: input.ownerId,
          subject: input.emailSubject,
          text: input.emailText,
        });
        await this.notificationModel
          .updateOne(
            { _id: created._id },
            {
              $addToSet: { channels: "EMAIL" },
              $set: { outboundEmailId: outbound._id },
            },
          )
          .exec();
      } catch {
        // The in-app notification remains durable when optional email delivery is unavailable.
      }
    }
    return created;
  }

  async createDeadlineReminder(
    deadlineId: string,
  ): Promise<NotificationDocument | null> {
    const deadline = await this.deadlineModel
      .findOne({
        _id: new Types.ObjectId(deadlineId),
        status: "OPEN",
      })
      .exec();
    if (!deadline) return null;
    const caseId = deadline.caseId;
    const ownerCase = await this.caseModel
      .findOne({ _id: caseId, deletedAt: null })
      .select({ ownerId: 1 })
      .exec();
    if (!ownerCase) return null;
    return this.create({
      body: "A verified procedural deadline is approaching. Review the case and confirm the next action.",
      caseId: caseId.toString(),
      deduplicationKey: `deadline-reminder-${deadlineId}-${String(deadline.dueAt)}`,
      emailSubject: "Recourse deadline reminder",
      emailText:
        "A verified procedural deadline is approaching. Review your Recourse case before taking action.",
      ownerId: ownerCase.ownerId.toString(),
      title: "Deadline approaching",
      type: "DEADLINE_REMINDER",
    });
  }

  async list(
    ownerId: string,
    unreadOnly = false,
  ): Promise<NotificationDocument[]> {
    return this.notificationModel
      .find({
        ownerId: new Types.ObjectId(ownerId),
        ...(unreadOnly ? { readAt: null } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }

  async markRead(
    ownerId: string,
    notificationId: string,
  ): Promise<NotificationDocument> {
    const updated = await this.notificationModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(notificationId),
          ownerId: new Types.ObjectId(ownerId),
        },
        { $set: { readAt: new Date() } },
        { returnDocument: "after" },
      )
      .exec();
    if (!updated) throw new NotFoundException("Notification not found.");
    return updated;
  }
}
