import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { isValidObjectId, Model, Types } from "mongoose";

import { type ClaimEvidenceStatus } from "@recourse/contracts";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
import { Case } from "../cases/schemas/case.schema";
import {
  Claim,
  type ClaimDocument,
  type ClaimSourceRef,
} from "./schemas/claim.schema";

export interface ExtractedCaseClaim {
  claimText: string;
  normalizedFact: string | null;
  evidenceStatus: ClaimEvidenceStatus;
  evidenceBlockIds: string[];
  confidence: number;
  modelRunId?: Types.ObjectId | null;
}

@Injectable()
export class ClaimService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    @InjectModel(EvidenceBlock.name)
    private readonly evidenceBlockModel: Model<EvidenceBlock>,
    private readonly ownership: OwnershipAuthorizationService,
  ) {}

  async upsertExtractedClaims(
    caseId: string,
    claims: ExtractedCaseClaim[],
    modelRunId: Types.ObjectId | null,
  ): Promise<ClaimDocument[]> {
    const caseDocument = await this.activeCase(caseId);
    const blockIds = claims.flatMap((claim) => claim.evidenceBlockIds);
    const blocks = await this.evidenceBlockModel
      .find({
        _id: { $in: blockIds.filter((id) => isValidObjectId(id)) },
        caseId: caseDocument._id,
      })
      .select({ _id: 1, evidenceId: 1, pageNumber: 1, blockIndex: 1 })
      .lean()
      .exec();
    const blockMap = new Map(
      blocks.map((block) => [block._id.toString(), block]),
    );
    const output: ClaimDocument[] = [];
    for (const claim of claims) {
      const validBlocks = claim.evidenceBlockIds
        .map((id) => ({ id, block: blockMap.get(id) }))
        .filter(
          (value): value is { id: string; block: (typeof blocks)[number] } =>
            Boolean(value.block),
        );
      if (validBlocks.length === 0) continue;
      const normalizedText = normalizeText(claim.claimText);
      const normalizedValue = claim.normalizedFact
        ? normalizeText(claim.normalizedFact)
        : null;
      const normalizedType = inferClaimType(claim.claimText, normalizedValue);
      const dedupKey = claimDedupKey(
        normalizedType,
        normalizedValue,
        normalizedText,
      );
      const sourceRefs: ClaimSourceRef[] = validBlocks.map(({ id, block }) => ({
        location: {
          blockIndex: block.blockIndex,
          evidenceId: block.evidenceId.toString(),
          pageNumber: block.pageNumber,
        },
        sourceId: id,
        sourceType: "EVIDENCE_BLOCK",
      }));
      const existing = await this.claimModel
        .findOne({ caseId: caseDocument._id, dedupKey })
        .exec();
      if (existing) {
        existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, sourceRefs);
        existing.confidence = Math.max(existing.confidence, claim.confidence);
        existing.status = mergeStatus(existing.status, claim.evidenceStatus);
        const effectiveModelRunId = claim.modelRunId ?? modelRunId;
        if (effectiveModelRunId) existing.modelRunId = effectiveModelRunId;
        await existing.save();
        output.push(existing);
        continue;
      }
      try {
        const created = new this.claimModel({
          caseId: caseDocument._id,
          confidence: claim.confidence,
          dedupKey,
          entityRefs: [],
          mergedIntoClaimId: null,
          modelRunId: claim.modelRunId ?? modelRunId,
          normalizedText,
          normalizedType,
          normalizedValue,
          ownerId: caseDocument.ownerId,
          resolutionStatus: "OPEN",
          sourceRefs,
          status: claim.evidenceStatus,
          text: claim.claimText.trim(),
          userConfirmedAt: null,
        });
        await created.save();
        output.push(created);
      } catch (error: unknown) {
        if (!isDuplicateKeyError(error)) throw error;
        const raced = await this.claimModel
          .findOne({ caseId: caseDocument._id, dedupKey })
          .exec();
        if (!raced) throw error;
        raced.sourceRefs = mergeSourceRefs(raced.sourceRefs, sourceRefs);
        raced.confidence = Math.max(raced.confidence, claim.confidence);
        raced.status = mergeStatus(raced.status, claim.evidenceStatus);
        const effectiveModelRunId = claim.modelRunId ?? modelRunId;
        if (effectiveModelRunId) raced.modelRunId = effectiveModelRunId;
        await raced.save();
        output.push(raced);
      }
    }
    return output;
  }

  async listForCase(ownerId: string, caseId: string): Promise<ClaimDocument[]> {
    await this.ownedCase(ownerId, caseId);
    return this.claimModel
      .find({
        caseId: new Types.ObjectId(caseId),
        ownerId: new Types.ObjectId(ownerId),
        resolutionStatus: { $ne: "MERGED" },
      })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
  }

  async listForAnalysis(caseId: string): Promise<ClaimDocument[]> {
    const caseDocument = await this.activeCase(caseId);
    return this.claimModel
      .find({ caseId: caseDocument._id, resolutionStatus: { $ne: "MERGED" } })
      .sort({ createdAt: 1, _id: 1 })
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

function inferClaimType(
  text: string,
  normalizedValue: string | null,
): string | null {
  const value = `${text} ${normalizedValue ?? ""}`.toLowerCase();
  if (/\b(account|seller|merchant|business|company|legal) name\b/u.test(value))
    return "ENTITY_NAME";
  if (
    /\b(registration|account|transaction|order|case|reference) (id|number|no)\b/u.test(
      value,
    )
  )
    return "IDENTIFIER";
  if (/\b(date|dated|on|before|after|deadline)\b/u.test(value)) return "DATE";
  if (/\b(amount|total|quantity|percent|percentage|number)\b/u.test(value))
    return "NUMBER";
  return null;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function claimDedupKey(
  normalizedType: string | null,
  normalizedValue: string | null,
  normalizedText: string,
): string {
  return digest(
    `${normalizedType ?? "unknown"}:${normalizedValue ?? normalizedText}`,
  );
}

function mergeSourceRefs(
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

function mergeStatus(
  left: ClaimEvidenceStatus,
  right: ClaimEvidenceStatus,
): ClaimEvidenceStatus {
  const rank: Record<ClaimEvidenceStatus, number> = {
    CONTRADICTED: 1,
    UNKNOWN: 0,
    INFERRED: 2,
    USER_ASSERTED: 3,
    EXTERNAL_VERIFIED: 4,
    VERIFIED_DOCUMENT: 5,
  };
  return rank[right] > rank[left] ? right : left;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}
