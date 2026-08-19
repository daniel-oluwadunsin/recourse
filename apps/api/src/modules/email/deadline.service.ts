import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import {
  type BusinessDayRule,
  type DeadlineRelativeUnit,
  type DeadlineTriggerType,
  type DeadlineType,
} from "@recourse/contracts";

import { CaseEventService } from "../cases/case-events.service";
import { Case } from "../cases/schemas/case.schema";
import {
  Deadline,
  type DeadlineDocument,
} from "../cases/schemas/deadline.schema";
import { ProceduralClaim } from "../procedure/schemas/procedural-claim.schema";
import { ProcedureVersion } from "../procedure/schemas/procedure-version.schema";
import { QueueProducerService } from "../queues/queue-producer.service";

@Injectable()
export class DeadlineService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Deadline.name) private readonly deadlineModel: Model<Deadline>,
    @InjectModel(ProceduralClaim.name)
    private readonly claimModel: Model<ProceduralClaim>,
    @InjectModel(ProcedureVersion.name)
    private readonly versionModel: Model<ProcedureVersion>,
    private readonly events: CaseEventService,
    private readonly queueProducer: QueueProducerService,
  ) {}

  async recalculate(
    caseId: string,
    triggerType: DeadlineTriggerType,
    triggerDate: Date,
    correlationId: string | null = null,
  ): Promise<DeadlineDocument[]> {
    const caseDocument = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(caseId),
        deletedAt: null,
      })
      .exec();
    if (!caseDocument) throw new NotFoundException("Case not found.");
    if (!caseDocument.activeProcedureVersionId) return [];
    const version = await this.versionModel
      .findById(caseDocument.activeProcedureVersionId)
      .exec();
    if (!version) return [];
    const claims = await this.claimModel
      .find({
        procedureVersionId: version._id,
        type: "DEADLINE",
        verificationStatus: "SUPPORTED",
      })
      .exec();
    if (claims.length === 0) return [];

    await this.deadlineModel
      .updateMany(
        {
          caseId: caseDocument._id,
          status: "OPEN",
          sourceProcedureVersionId: { $ne: version._id },
        },
        { $set: { status: "UNKNOWN" } },
      )
      .exec();

    const candidates = claims
      .map((claim) =>
        this.candidateForClaim(claim, version, triggerType, triggerDate),
      )
      .filter(
        (candidate): candidate is DeadlineCandidate => candidate !== null,
      );
    const grouped = new Map<DeadlineType, DeadlineCandidate[]>();
    for (const candidate of candidates) {
      const list = grouped.get(candidate.type) ?? [];
      list.push(candidate);
      grouped.set(candidate.type, list);
    }
    const created: DeadlineDocument[] = [];
    for (const [type, group] of grouped) {
      const conflicted = group.some(
        (candidate) =>
          Math.abs(candidate.dueAt.getTime() - group[0]!.dueAt.getTime()) >
          60_000,
      );
      for (const candidate of group) {
        const existing = await this.deadlineModel
          .findOne({
            caseId: caseDocument._id,
            sourceProceduralClaimId: candidate.sourceProceduralClaimId,
            triggerDate: candidate.triggerDate,
          })
          .exec();
        if (existing) {
          created.push(existing);
          continue;
        }
        const deadline = await this.deadlineModel.create({
          businessDayRule: candidate.businessDayRule,
          confidence: candidate.confidence,
          caseId: caseDocument._id,
          dueAt: candidate.dueAt,
          relativeAmount: candidate.relativeAmount,
          relativeUnit: candidate.relativeUnit,
          reminderSchedule: reminderSchedule(candidate.dueAt),
          sourceProcedureVersionId: version._id,
          sourceProceduralClaimId: candidate.sourceProceduralClaimId,
          sourceSnapshotId: candidate.sourceSnapshotId,
          status: conflicted ? "CONFLICTED" : "OPEN",
          timezone: candidate.timezone,
          triggerDate: candidate.triggerDate,
          triggerType: candidate.triggerType,
          type,
        });
        created.push(deadline);
        await this.events.append({
          actor: {
            actorId: null,
            actorType: "SYSTEM",
            correlationId: correlationId ?? undefined,
          },
          caseId,
          idempotencyKey: `deadline-created-${deadline._id.toString()}`,
          payload: {
            deadlineId: deadline._id.toString(),
            procedureVersionId: version._id.toString(),
            status: deadline.status,
          },
          type: "DEADLINE_CREATED",
        });
        if (deadline.status === "OPEN") await this.scheduleReminders(deadline);
      }
    }
    return created;
  }

  async list(ownerId: string, caseId: string): Promise<DeadlineDocument[]> {
    const owned = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(caseId),
        deletedAt: null,
        ownerId: new Types.ObjectId(ownerId),
      })
      .select({ _id: 1 })
      .exec();
    if (!owned) throw new NotFoundException("Case not found.");
    return this.deadlineModel
      .find({ caseId: owned._id })
      .sort({ dueAt: 1, _id: 1 })
      .exec();
  }

  async expireDue(now = new Date()): Promise<number> {
    const result = await this.deadlineModel
      .updateMany(
        { dueAt: { $lt: now }, status: "OPEN" },
        { $set: { status: "EXPIRED" } },
      )
      .exec();
    return result.modifiedCount;
  }

  private async scheduleReminders(deadline: DeadlineDocument): Promise<void> {
    for (const reminder of deadline.reminderSchedule) {
      const delay = Math.max(0, reminder.getTime() - Date.now());
      await this.queueProducer.enqueueNotification(
        {
          correlationId: null,
          deadlineId: deadline._id.toString(),
          idempotencyKey: `deadline-reminder-${deadline._id.toString()}-${reminder.toISOString()}`,
          kind: "DEADLINE_REMINDER",
          notificationId: null,
          outboundEmailId: null,
          workflowVersion: "phase-10-v1",
        },
        delay,
      );
    }
  }

  private candidateForClaim(
    claim: ProceduralClaim,
    version: ProcedureVersion,
    triggerType: DeadlineTriggerType,
    triggerDate: Date,
  ): DeadlineCandidate | null {
    const normalized = claim.normalizedValue as Record<string, unknown>;
    const matchingDeadline = version.deadlines.find((deadline) => {
      const text = typeof deadline.dueText === "string" ? deadline.dueText : "";
      return text && claim.humanText.includes(text);
    });
    const relativeAmount =
      readNumber(normalized.relativeAmount) ??
      readNumber(matchingDeadline?.relativeDays);
    if (relativeAmount === null) return null;
    const relativeUnit = readUnit(normalized.relativeUnit) ?? "DAYS";
    const rule =
      readBusinessRule(normalized.businessDayRule) ?? "CALENDAR_DAYS";
    const claimTrigger = readTrigger(normalized.triggerType) ?? triggerType;
    if (claimTrigger !== triggerType) return null;
    const timezone =
      typeof normalized.timezone === "string" ? normalized.timezone : "UTC";
    const dueAt = addRelative(
      triggerDate,
      relativeAmount,
      relativeUnit,
      rule,
      timezone,
    );
    const type =
      readDeadlineType(normalized.type) ?? inferType(claim.humanText);
    return {
      businessDayRule: rule,
      confidence: claim.confidence,
      dueAt,
      relativeAmount,
      relativeUnit,
      sourceProceduralClaimId: (
        claim as ProceduralClaim & { _id: Types.ObjectId }
      )._id,
      sourceSnapshotId: claim.support[0]?.sourceSnapshotId ?? null,
      timezone,
      triggerDate,
      triggerType: claimTrigger,
      type,
    };
  }
}

interface DeadlineCandidate {
  type: DeadlineType;
  sourceProceduralClaimId: Types.ObjectId;
  sourceSnapshotId: Types.ObjectId | null;
  triggerType: DeadlineTriggerType;
  triggerDate: Date;
  relativeAmount: number;
  relativeUnit: DeadlineRelativeUnit;
  businessDayRule: BusinessDayRule;
  timezone: string;
  dueAt: Date;
  confidence: number;
}

export function addRelative(
  date: Date,
  amount: number,
  unit: DeadlineRelativeUnit,
  rule: BusinessDayRule,
  timezone = "UTC",
): Date {
  if (unit === "HOURS")
    return new Date(date.getTime() + amount * 60 * 60 * 1000);
  const days =
    unit === "WEEKS" ? amount * 7 : unit === "MONTHS" ? amount * 30 : amount;
  const result = new Date(localWallClockMs(date, timezone));
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (rule !== "BUSINESS_DAYS" || ![0, 6].includes(result.getUTCDay()))
      remaining -= 1;
  }
  return fromLocalWallClock(result, timezone);
}

function localWallClockMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    calendar: "iso8601",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(
    values.get("year") ?? 0,
    (values.get("month") ?? 1) - 1,
    values.get("day") ?? 1,
    values.get("hour") ?? 0,
    values.get("minute") ?? 0,
    values.get("second") ?? 0,
  );
}

function fromLocalWallClock(localDate: Date, timezone: string): Date {
  const localMs = localDate.getTime();
  const initialGuess = new Date(localMs);
  const offsetMs =
    localWallClockMs(initialGuess, timezone) - initialGuess.getTime();
  const adjustedGuess = new Date(localMs - offsetMs);
  const adjustedOffsetMs =
    localWallClockMs(adjustedGuess, timezone) - adjustedGuess.getTime();
  return new Date(localMs - adjustedOffsetMs);
}

function reminderSchedule(dueAt: Date): Date[] {
  return [24 * 60 * 60 * 1000, 60 * 60 * 1000]
    .map((offset) => new Date(dueAt.getTime() - offset))
    .filter((value) => value.getTime() > Date.now());
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function readUnit(value: unknown): DeadlineRelativeUnit | null {
  return value === "HOURS" ||
    value === "DAYS" ||
    value === "WEEKS" ||
    value === "MONTHS"
    ? value
    : null;
}

function readTrigger(value: unknown): DeadlineTriggerType | null {
  return value === "DECISION_DATE" ||
    value === "NOTIFICATION_DATE" ||
    value === "RESPONSE_DATE" ||
    value === "USER_ENTERED"
    ? value
    : null;
}

function readBusinessRule(value: unknown): BusinessDayRule | null {
  return value === "CALENDAR_DAYS" || value === "BUSINESS_DAYS" ? value : null;
}

function readDeadlineType(value: unknown): DeadlineType | null {
  return value === "APPEAL" ||
    value === "REVIEW" ||
    value === "RESPONSE" ||
    value === "ESCALATION"
    ? value
    : null;
}

function inferType(text: string): DeadlineType {
  if (/review/iu.test(text)) return "REVIEW";
  if (/escalat/iu.test(text)) return "ESCALATION";
  if (/response/iu.test(text)) return "RESPONSE";
  return "APPEAL";
}
