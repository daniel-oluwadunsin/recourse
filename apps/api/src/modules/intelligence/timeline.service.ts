import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { isValidObjectId, Model, Types } from "mongoose";

import { type TimelineDatePrecision } from "@recourse/contracts";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { Case } from "../cases/schemas/case.schema";
import {
  TimelineEvent,
  type TimelineEventDocument,
} from "./schemas/timeline-event.schema";
import { type ClaimSourceRef } from "./schemas/claim.schema";

export interface ExtractedTimelineEvent {
  eventText: string;
  date: string | null;
  datePrecision: TimelineDatePrecision;
  evidenceBlockIds: string[];
  confidence: number;
}

@Injectable()
export class TimelineService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(TimelineEvent.name)
    private readonly timelineModel: Model<TimelineEvent>,
    private readonly ownership: OwnershipAuthorizationService,
  ) {}

  async upsertExtractedEvents(
    caseId: string,
    events: ExtractedTimelineEvent[],
  ): Promise<TimelineEventDocument[]> {
    const caseDocument = await this.activeCase(caseId);
    const output: TimelineEventDocument[] = [];
    for (const event of events) {
      const normalizedText = normalizeText(event.eventText);
      const normalizedDate = parseDate(event.date);
      const eventKey = digest(
        `${normalizedDate?.toISOString() ?? "unknown"}:${normalizedText}`,
      );
      const sourceRefs: ClaimSourceRef[] = event.evidenceBlockIds.map((id) => ({
        location: null,
        sourceId: id,
        sourceType: "EVIDENCE_BLOCK",
      }));
      const existing = await this.timelineModel
        .findOne({ caseId: caseDocument._id, eventKey })
        .exec();
      if (existing) {
        existing.sourceRefs = mergeRefs(existing.sourceRefs, sourceRefs);
        existing.confidence = Math.max(existing.confidence, event.confidence);
        await existing.save();
        output.push(existing);
        continue;
      }
      const created = await this.timelineModel.create({
        caseId: caseDocument._id,
        confidence: event.confidence,
        datePrecision: event.datePrecision,
        eventKey,
        eventText: event.eventText.trim(),
        metadata: null,
        normalizedDate,
        ownerId: caseDocument.ownerId,
        rawDateText: event.date,
        sourceRefs,
      });
      output.push(created);
    }
    return output;
  }

  async listForCase(
    ownerId: string,
    caseId: string,
  ): Promise<TimelineEventDocument[]> {
    await this.ownedCase(ownerId, caseId);
    return this.timelineModel
      .find(
        this.ownership.withOwnerScope(ownerId, {
          caseId: new Types.ObjectId(caseId),
        }),
      )
      .sort({ normalizedDate: 1, _id: 1 })
      .exec();
  }

  async listForAnalysis(caseId: string): Promise<TimelineEventDocument[]> {
    const caseDocument = await this.activeCase(caseId);
    return this.timelineModel
      .find({ caseId: caseDocument._id })
      .sort({ normalizedDate: 1, _id: 1 })
      .exec();
  }

  private async activeCase(
    caseId: string,
  ): Promise<Case & { _id: Types.ObjectId }> {
    if (!isValidObjectId(caseId))
      throw new NotFoundException("Case not found.");
    const value = await this.caseModel
      .findOne({ _id: new Types.ObjectId(caseId), deletedAt: null })
      .exec();
    if (!value) throw new NotFoundException("Case not found.");
    return value;
  }

  private async ownedCase(
    ownerId: string,
    caseId: string,
  ): Promise<Case & { _id: Types.ObjectId }> {
    if (!isValidObjectId(caseId))
      throw new NotFoundException("Case not found.");
    const value = await this.caseModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: new Types.ObjectId(caseId),
          deletedAt: null,
        }),
      )
      .exec();
    if (!value) throw new NotFoundException("Case not found.");
    return value;
  }
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mergeRefs(
  current: ClaimSourceRef[],
  incoming: ClaimSourceRef[],
): ClaimSourceRef[] {
  const seen = new Set(
    current.map((ref) => `${ref.sourceType}:${ref.sourceId}`),
  );
  return [
    ...current,
    ...incoming.filter((ref) => {
      const key = `${ref.sourceType}:${ref.sourceId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}
