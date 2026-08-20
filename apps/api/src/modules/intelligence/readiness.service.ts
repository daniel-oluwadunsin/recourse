import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import {
  type ReadinessFactor,
  type ReadinessFactorStatus,
} from "@recourse/contracts";

import { Case, type ReadinessSnapshot } from "../cases/schemas/case.schema";
import { Procedure } from "../procedure/schemas/procedure.schema";
import { ProcedureVersion } from "../procedure/schemas/procedure-version.schema";
import { type ClaimDocument } from "./schemas/claim.schema";
import { type ContradictionDocument } from "./schemas/contradiction.schema";
import { type EvidenceRequirementMatchDocument } from "./schemas/evidence-requirement-match.schema";
import { type TimelineEventDocument } from "./schemas/timeline-event.schema";

export const READINESS_VERSION = "v1";

export interface ReadinessInputs {
  caseDocument: Case;
  procedure: Procedure | null;
  procedureVersion: ProcedureVersion | null;
  claims: ClaimDocument[];
  timeline: TimelineEventDocument[];
  contradictions: ContradictionDocument[];
  requirements: EvidenceRequirementMatchDocument[];
}

export interface ReadinessResult {
  score: number;
  version: string;
  factors: ReadinessFactor[];
  caps: string[];
  computedAt: Date;
}

@Injectable()
export class ReadinessService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
  ) {}

  calculate(input: ReadinessInputs, now = new Date()): ReadinessResult {
    const criticalRequirements = input.requirements.filter(
      (requirement) => requirement.critical,
    );
    const satisfiedRequirements = criticalRequirements.filter(
      (requirement) =>
        requirement.status === "SATISFIED" ||
        requirement.status === "NOT_APPLICABLE",
    );
    const requirementScore = criticalRequirements.length
      ? satisfiedRequirements.length / criticalRequirements.length
      : input.procedureVersion
        ? 1
        : 0;
    const groundedClaims = input.claims.filter((claim) =>
      ["VERIFIED_DOCUMENT", "EXTERNAL_VERIFIED"].includes(claim.status),
    ).length;
    const claimScore = input.claims.length
      ? groundedClaims / input.claims.length
      : 0;
    const datedTimeline = input.timeline.filter(
      (event) => event.normalizedDate,
    );
    const chronologyScore = datedTimeline.length
      ? datedTimeline.filter(
          (event) => event.normalizedDate && event.datePrecision === "EXACT",
        ).length / datedTimeline.length
      : 0;
    const procedureScore = input.procedureVersion?.confidence ?? 0;
    const jurisdictionScore = jurisdictionConfidence(input.caseDocument);
    const unresolvedContradictions = input.contradictions.filter(
      (contradiction) => ["OPEN", "UNKNOWN"].includes(contradiction.status),
    );
    const contradictionPenalty = Math.min(
      1,
      unresolvedContradictions.length / 3,
    );
    const raw =
      40 * requirementScore +
      20 * claimScore +
      10 * chronologyScore +
      10 * procedureScore +
      10 * jurisdictionScore -
      10 * contradictionPenalty;
    const caps: string[] = [];
    let score = Math.max(0, Math.min(100, Number(raw.toFixed(2))));
    if (
      !input.procedure ||
      !input.procedureVersion ||
      input.procedure.status !== "ACTIVE"
    ) {
      score = Math.min(score, 39);
      caps.push("PROCEDURE_NOT_VERIFIED");
    }
    if (
      criticalRequirements.some((requirement) =>
        ["MISSING", "UNCERTAIN", "PARTIAL"].includes(requirement.status),
      )
    ) {
      score = Math.min(score, 59);
      caps.push("CRITICAL_REQUIREMENT_GAP");
    }
    if (unresolvedContradictions.length > 0) {
      score = Math.min(score, 59);
      caps.push("UNRESOLVED_MATERIAL_CONTRADICTION");
    }
    const factors: ReadinessFactor[] = [
      factor(
        "critical-procedure-requirements",
        requirementScore,
        40,
        criticalRequirements.length ? "SATISFIED" : "UNCERTAIN",
        criticalRequirements.length
          ? `${satisfiedRequirements.length}/${criticalRequirements.length} critical requirements satisfied.`
          : "No verified procedure requirements are available.",
      ),
      factor(
        "core-allegation-evidence",
        claimScore,
        20,
        groundedClaims > 0 ? "SATISFIED" : "MISSING",
        `${groundedClaims}/${input.claims.length} claims have verified evidence status.`,
      ),
      factor(
        "chronology-completeness",
        chronologyScore,
        10,
        chronologyScore >= 1 ? "SATISFIED" : "UNCERTAIN",
        datedTimeline.length
          ? `${datedTimeline.filter((event) => event.datePrecision === "EXACT").length}/${datedTimeline.length} dated timeline events are exact.`
          : "No dated timeline event is available.",
      ),
      factor(
        "procedure-confidence",
        procedureScore,
        10,
        procedureScore >= 0.65 ? "SATISFIED" : "UNCERTAIN",
        `Procedure confidence is ${procedureScore.toFixed(2)}.`,
      ),
      factor(
        "jurisdiction-confidence",
        jurisdictionScore,
        10,
        jurisdictionScore >= 1 ? "SATISFIED" : "UNCERTAIN",
        "Jurisdiction confidence is derived from structured case metadata.",
      ),
      factor(
        "contradiction-penalty",
        -contradictionPenalty,
        -10,
        unresolvedContradictions.length ? "CONFLICTED" : "SATISFIED",
        `${unresolvedContradictions.length} unresolved contradiction(s).`,
      ),
    ];
    return {
      caps,
      computedAt: now,
      factors,
      score,
      version: READINESS_VERSION,
    };
  }

  async persist(caseId: string, result: ReadinessResult): Promise<Case> {
    const value = await this.caseModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(caseId), deletedAt: null },
        {
          $set: {
            readiness: result satisfies ReadinessSnapshot,
            updatedAt: result.computedAt,
          },
        },
        { returnDocument: "after" },
      )
      .exec();
    if (!value) throw new NotFoundException("Case not found.");
    return value;
  }
}

function factor(
  key: string,
  normalized: number,
  weight: number,
  status: ReadinessFactorStatus,
  reason: string,
): ReadinessFactor {
  return {
    key,
    reason,
    scoreImpact: Number((normalized * weight).toFixed(2)),
    status,
  };
}

function jurisdictionConfidence(caseDocument: Case): number {
  if (!caseDocument.jurisdiction?.countryCode) return 0;
  return caseDocument.jurisdiction.source ? 1 : 0.5;
}
