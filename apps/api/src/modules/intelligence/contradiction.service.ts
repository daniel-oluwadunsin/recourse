import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";

import {
  type ClaimEvidenceStatus,
  type ContradictionKind,
  type ContradictionStatus,
} from "@recourse/contracts";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { AIOperationService } from "../ai/ai-operation.service";
import { AIProviderError } from "../ai/ai.types";
import { Case } from "../cases/schemas/case.schema";
import { Claim, type ClaimDocument } from "./schemas/claim.schema";
import {
  Contradiction,
  type ContradictionDocument,
} from "./schemas/contradiction.schema";

export interface ContradictionAnalysisResult {
  contradictions: ContradictionDocument[];
  discovered: ContradictionDocument[];
}

@Injectable()
export class ContradictionService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    @InjectModel(Contradiction.name)
    private readonly contradictionModel: Model<Contradiction>,
    private readonly ai: AIOperationService,
    private readonly ownership: OwnershipAuthorizationService,
  ) {}

  async analyzeCase(caseId: string): Promise<ContradictionAnalysisResult> {
    const caseDocument = await this.activeCase(caseId);
    const claims = await this.claimModel
      .find({ caseId: caseDocument._id, resolutionStatus: { $ne: "MERGED" } })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    const candidates = candidatePairs(claims).slice(0, 100);
    const discovered: ContradictionDocument[] = [];
    for (const [claimA, claimB] of candidates) {
      const kind = contradictionKind(claimA, claimB);
      if (!kind) continue;
      const resolution = await this.resolveCandidate(claimA, claimB, kind);
      const candidateKey = [claimA._id.toString(), claimB._id.toString()]
        .sort()
        .join(":");
      const existing = await this.contradictionModel
        .findOne({ caseId: caseDocument._id, candidateKey, kind })
        .exec();
      const document = existing
        ? await this.contradictionModel
            .findOneAndUpdate(
              { _id: existing._id },
              {
                $set: {
                  deterministicCandidate: resolution.deterministic,
                  explanation: resolution.explanation,
                  modelRunId: resolution.modelRunId,
                  resolutionRefs: resolution.resolutionRefs,
                  severity: resolution.severity,
                  status: resolution.status,
                },
              },
              { returnDocument: "after" },
            )
            .exec()
        : await this.contradictionModel.create({
            caseId: caseDocument._id,
            claimAId: claimA._id,
            claimBId: claimB._id,
            candidateKey,
            deterministicCandidate: resolution.deterministic,
            explanation: resolution.explanation,
            kind,
            modelRunId: resolution.modelRunId,
            ownerId: caseDocument.ownerId,
            resolutionRefs: resolution.resolutionRefs,
            severity: resolution.severity,
            status: resolution.status,
          });
      if (!document) continue;
      discovered.push(document);
    }
    const currentKeys = discovered.map((item) => item.candidateKey);
    await this.contradictionModel
      .updateMany(
        {
          caseId: caseDocument._id,
          status: { $in: ["OPEN", "UNKNOWN"] },
          ...(currentKeys.length > 0
            ? { candidateKey: { $nin: currentKeys } }
            : {}),
        },
        {
          $set: {
            explanation:
              "The claims no longer form a material contradiction under the current normalized evidence.",
            status: "EXPLAINABLE",
          },
        },
      )
      .exec();
    const openContradictionCount = await this.contradictionModel.countDocuments(
      {
        caseId: caseDocument._id,
        status: { $in: ["OPEN", "UNKNOWN"] },
      },
    );
    await this.caseModel
      .updateOne(
        { _id: caseDocument._id, deletedAt: null },
        {
          $set: {
            contradictionCount: openContradictionCount,
          },
        },
      )
      .exec();
    const contradictions = await this.contradictionModel
      .find({ caseId: caseDocument._id })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    return { contradictions, discovered };
  }

  async listForCase(
    ownerId: string,
    caseId: string,
  ): Promise<ContradictionDocument[]> {
    await this.ownedCase(ownerId, caseId);
    return this.contradictionModel
      .find(
        this.ownership.withOwnerScope(ownerId, {
          caseId: new Types.ObjectId(caseId),
        }),
      )
      .sort({ createdAt: 1, _id: 1 })
      .exec();
  }

  private async resolveCandidate(
    claimA: ClaimDocument,
    claimB: ClaimDocument,
    kind: ContradictionKind,
  ): Promise<{
    status: ContradictionStatus;
    severity: "LOW" | "MEDIUM" | "HIGH";
    explanation: string;
    deterministic: boolean;
    modelRunId: Types.ObjectId | null;
    resolutionRefs: string[];
  }> {
    const explainable = strongerEvidenceExplains(claimA.status, claimB.status);
    if (explainable) {
      return {
        deterministic: true,
        explanation: explainable,
        modelRunId: null,
        resolutionRefs: [...claimA.sourceRefs, ...claimB.sourceRefs].map(
          (source) => source.sourceId,
        ),
        severity: "LOW",
        status: "EXPLAINABLE",
      };
    }
    if (kind !== "SEMANTIC_CONFLICT") {
      return {
        deterministic: true,
        explanation:
          "Structured evidence contains materially different values.",
        modelRunId: null,
        resolutionRefs: [...claimA.sourceRefs, ...claimB.sourceRefs].map(
          (source) => source.sourceId,
        ),
        severity: "HIGH",
        status: "OPEN",
      };
    }
    try {
      const result = await this.ai.detectClaimConflicts({
        caseId: claimA.caseId.toString(),
        claimA: {
          claimId: claimA._id.toString(),
          normalizedType: claimA.normalizedType,
          normalizedValue: claimA.normalizedValue,
          sourceRefs: claimA.sourceRefs.map((source) => source.sourceId),
          status: claimA.status,
          text: claimA.text,
        },
        claimB: {
          claimId: claimB._id.toString(),
          normalizedType: claimB.normalizedType,
          normalizedValue: claimB.normalizedValue,
          sourceRefs: claimB.sourceRefs.map((source) => source.sourceId),
          status: claimB.status,
          text: claimB.text,
        },
      });
      return {
        deterministic: false,
        explanation: result.output.explanation,
        modelRunId: result.run._id,
        resolutionRefs: [],
        severity: result.output.status === "OPEN" ? "HIGH" : "MEDIUM",
        status: result.output.status,
      };
    } catch (error: unknown) {
      if (!(error instanceof AIProviderError)) throw error;
      return {
        deterministic: false,
        explanation:
          "Semantic contradiction requires human or provider review.",
        modelRunId: null,
        resolutionRefs: [],
        severity: "HIGH",
        status: "UNKNOWN",
      };
    }
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

export function candidatePairs(
  claims: ClaimDocument[],
): Array<[ClaimDocument, ClaimDocument]> {
  const output: Array<[ClaimDocument, ClaimDocument]> = [];
  for (let left = 0; left < claims.length; left += 1) {
    for (let right = left + 1; right < claims.length; right += 1) {
      const claimA = claims[left];
      const claimB = claims[right];
      if (!claimA || !claimB) continue;
      const leftSources = new Set(
        claimA.sourceRefs.map(
          (source) => `${source.sourceType}:${source.sourceId}`,
        ),
      );
      if (
        claimB.sourceRefs.some((source) =>
          leftSources.has(`${source.sourceType}:${source.sourceId}`),
        )
      )
        continue;
      if (
        claimA.normalizedType &&
        claimA.normalizedType === claimB.normalizedType &&
        materiallyDifferentNormalizedValues(claimA, claimB)
      ) {
        output.push([claimA, claimB]);
      }
    }
  }
  return output;
}

function materiallyDifferentNormalizedValues(
  claimA: ClaimDocument,
  claimB: ClaimDocument,
): boolean {
  if (!claimA.normalizedValue || !claimB.normalizedValue) return false;
  if (claimA.normalizedType === "DATE") {
    const left = normalizedDateValue(claimA.normalizedValue);
    const right = normalizedDateValue(claimB.normalizedValue);
    return left !== null && right !== null && left !== right;
  }
  return (
    claimA.normalizedValue.trim().toLowerCase() !==
    claimB.normalizedValue.trim().toLowerCase()
  );
}

function normalizedDateValue(value: string): string | null {
  const match = value.match(
    /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}/iu,
  );
  if (!match) return null;
  const parsed = new Date(match[0]);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function contradictionKind(
  claimA: ClaimDocument,
  claimB: ClaimDocument,
): ContradictionKind | null {
  if (claimA.normalizedType !== claimB.normalizedType) return null;
  switch (claimA.normalizedType) {
    case "DATE":
      return "DATE_MISMATCH";
    case "NUMBER":
      return "NUMBER_MISMATCH";
    case "IDENTIFIER":
      return "IDENTIFIER_MISMATCH";
    case "ENTITY_NAME":
      return "ENTITY_NAME_MISMATCH";
    default:
      return "SEMANTIC_CONFLICT";
  }
}

function strongerEvidenceExplains(
  left: ClaimEvidenceStatus,
  right: ClaimEvidenceStatus,
): string | null {
  const verified = (value: ClaimEvidenceStatus): boolean =>
    value === "VERIFIED_DOCUMENT" || value === "EXTERNAL_VERIFIED";
  const asserted = (value: ClaimEvidenceStatus): boolean =>
    value === "USER_ASSERTED" || value === "INFERRED";
  if (
    (verified(left) && asserted(right)) ||
    (verified(right) && asserted(left))
  ) {
    return "A verified source is stronger than the conflicting assertion or inference; the discrepancy is retained as explainable.";
  }
  return null;
}

export function deterministicConflictStatus(
  left: ClaimEvidenceStatus,
  right: ClaimEvidenceStatus,
): "EXPLAINABLE" | "OPEN" {
  return strongerEvidenceExplains(left, right) ? "EXPLAINABLE" : "OPEN";
}
