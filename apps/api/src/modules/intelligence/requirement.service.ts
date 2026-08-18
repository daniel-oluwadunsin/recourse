import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";

import { type EvidenceRequirementMatchStatus } from "@recourse/contracts";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { Case } from "../cases/schemas/case.schema";
import { ProcedureVersion } from "../procedure/schemas/procedure-version.schema";
import { Claim, type ClaimDocument } from "./schemas/claim.schema";
import {
  EvidenceRequirementMatch,
  type EvidenceRequirementMatchDocument,
} from "./schemas/evidence-requirement-match.schema";

@Injectable()
export class RequirementService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(ProcedureVersion.name)
    private readonly procedureVersionModel: Model<ProcedureVersion>,
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    @InjectModel(EvidenceRequirementMatch.name)
    private readonly matchModel: Model<EvidenceRequirementMatch>,
    private readonly ownership: OwnershipAuthorizationService,
  ) {}

  async matchCase(caseId: string): Promise<EvidenceRequirementMatchDocument[]> {
    const caseDocument = await this.activeCase(caseId);
    if (!caseDocument.activeProcedureVersionId) return [];
    const version = await this.procedureVersionModel
      .findById(caseDocument.activeProcedureVersionId)
      .exec();
    if (!version) return [];
    const claims = await this.claimModel
      .find({ caseId: caseDocument._id, resolutionStatus: { $ne: "MERGED" } })
      .exec();
    const matches: EvidenceRequirementMatchDocument[] = [];
    for (const [index, raw] of version.evidenceRequirements.entries()) {
      const requirement = readRequirement(raw);
      if (!requirement) continue;
      const { critical, text: requirementText } = requirement;
      const requirementKey = requirementKeyFor(requirementText, index);
      const matchingClaims = claims.filter((claim) =>
        claimMatches(claim, requirementText),
      );
      const status = matchStatus(matchingClaims);
      const evidenceIds = unique(
        matchingClaims.flatMap((claim) =>
          claim.sourceRefs
            .filter((source) => source.sourceType === "EVIDENCE_BLOCK")
            .map((source) => {
              const value = source.location?.evidenceId;
              return typeof value === "string" ? value : null;
            })
            .filter((value): value is string => Boolean(value)),
        ),
      ).filter((id) => isValidObjectId(id));
      const match = await this.matchModel
        .findOneAndUpdate(
          {
            caseId: caseDocument._id,
            procedureVersionId: version._id,
            requirementKey,
          },
          {
            $set: {
              claimIds: matchingClaims.map((claim) => claim._id),
              confidence: matchConfidence(status, matchingClaims),
              critical,
              evidenceIds: evidenceIds.map((id) => new Types.ObjectId(id)),
              reason: reasonFor(status, matchingClaims),
              requirementText,
              status,
            },
            $setOnInsert: {
              caseId: caseDocument._id,
              ownerId: caseDocument.ownerId,
              procedureVersionId: version._id,
              requirementKey,
            },
          },
          { new: true, upsert: true },
        )
        .exec();
      if (match) matches.push(match);
    }
    await this.caseModel
      .updateOne(
        { _id: caseDocument._id, deletedAt: null },
        {
          $set: {
            openCriticalGapCount: matches.filter(
              (match) =>
                match.critical &&
                ["MISSING", "UNCERTAIN", "PARTIAL"].includes(match.status),
            ).length,
          },
        },
      )
      .exec();
    return matches;
  }

  async listForCase(
    ownerId: string,
    caseId: string,
  ): Promise<EvidenceRequirementMatchDocument[]> {
    await this.ownedCase(ownerId, caseId);
    return this.matchModel
      .find(
        this.ownership.withOwnerScope(ownerId, {
          caseId: new Types.ObjectId(caseId),
        }),
      )
      .sort({ critical: -1, requirementKey: 1 })
      .exec();
  }

  async listForAnalysis(
    caseId: string,
  ): Promise<EvidenceRequirementMatchDocument[]> {
    const caseDocument = await this.activeCase(caseId);
    return this.matchModel
      .find({ caseId: caseDocument._id })
      .sort({ critical: -1, requirementKey: 1 })
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

function readRequirement(
  value: Record<string, unknown>,
): { critical: boolean; text: string } | null {
  const text = value.text;
  if (typeof text !== "string" || !text.trim()) return null;
  return {
    critical: value.critical !== false,
    text: text.trim(),
  };
}

function requirementKeyFor(text: string, index: number): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return `${normalized.slice(0, 80) || "requirement"}-${index + 1}`;
}

function claimMatches(claim: ClaimDocument, requirementText: string): boolean {
  const requirementTokens = tokens(requirementText);
  const claimText =
    `${claim.text} ${claim.normalizedValue ?? ""}`.toLowerCase();
  const overlap = requirementTokens.filter((token) =>
    claimText.includes(token),
  );
  return overlap.length >= Math.min(2, requirementTokens.length);
}

function tokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/u)
        .filter((token) => token.length >= 4),
    ),
  ].slice(0, 8);
}

function matchStatus(claims: ClaimDocument[]): EvidenceRequirementMatchStatus {
  if (claims.length === 0) return "MISSING";
  if (
    claims.some(
      (claim) =>
        claim.status === "VERIFIED_DOCUMENT" ||
        claim.status === "EXTERNAL_VERIFIED",
    )
  )
    return "SATISFIED";
  if (
    claims.some(
      (claim) =>
        claim.status === "USER_ASSERTED" || claim.status === "INFERRED",
    )
  )
    return "UNCERTAIN";
  return "PARTIAL";
}

function matchConfidence(
  status: EvidenceRequirementMatchStatus,
  claims: ClaimDocument[],
): number {
  if (status === "SATISFIED")
    return Math.max(...claims.map((claim) => claim.confidence), 0);
  if (status === "UNCERTAIN") return 0.5;
  if (status === "PARTIAL") return 0.35;
  return 0;
}

function reasonFor(
  status: EvidenceRequirementMatchStatus,
  claims: ClaimDocument[],
): string {
  if (status === "SATISFIED")
    return `Matched ${claims.length} verified claim(s) to the requirement.`;
  if (status === "UNCERTAIN")
    return "Only asserted or inferred evidence currently matches this requirement.";
  if (status === "PARTIAL")
    return "Some evidence matched, but it is not verified enough to satisfy the requirement.";
  return "No grounded case claim currently matches this requirement.";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
