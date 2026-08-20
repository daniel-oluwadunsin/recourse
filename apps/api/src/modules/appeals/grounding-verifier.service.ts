import { Injectable, Optional } from "@nestjs/common";

import {
  type AppealStructuredArguments,
  type ClaimEvidenceStatus,
  type ProceduralClaimVerificationStatus,
} from "@recourse/contracts";

import { type GroundedSentence, type GroundingResult } from "./appeal.types";
import { ApplicationObservabilityService } from "../../common/observability.service";

export interface GroundingClaim {
  id: string;
  text: string;
  status: ClaimEvidenceStatus;
  sourceRefs: Array<{ sourceType: string; sourceId: string }>;
}

export interface GroundingProceduralClaim {
  id: string;
  humanText: string;
  verificationStatus: ProceduralClaimVerificationStatus;
  procedureVersionId: string;
  support: Array<{ sourceSnapshotId: string; paragraphIds: string[] }>;
}

export interface GroundingContext {
  procedureVersionId: string;
  claims: GroundingClaim[];
  proceduralClaims: GroundingProceduralClaim[];
  evidenceIds: Set<string>;
}

const verifiedEvidenceStatuses = new Set<ClaimEvidenceStatus>([
  "VERIFIED_DOCUMENT",
  "EXTERNAL_VERIFIED",
]);

@Injectable()
export class GroundingVerifierService {
  constructor(
    @Optional()
    private readonly observability?: ApplicationObservabilityService,
  ) {}

  verify(
    structured: AppealStructuredArguments,
    context: GroundingContext,
  ): GroundingResult {
    const claims = new Map(context.claims.map((claim) => [claim.id, claim]));
    const proceduralClaims = new Map(
      context.proceduralClaims.map((claim) => [claim.id, claim]),
    );
    const sentences: GroundedSentence[] = [
      {
        claimIds: [],
        evidenceIds: [],
        kind: "CONTEXT",
        material: false,
        proceduralClaimIds: [],
        sentenceId: "intro",
        text: structured.introduction,
      },
    ];

    for (const [index, argument] of structured.arguments.entries()) {
      const materialFact = argument.supportingClaimIds.length > 0;
      const materialProcedure =
        argument.supportingProceduralClaimIds.length > 0;
      const claimSupport = argument.supportingClaimIds.every((id) => {
        const claim = claims.get(id);
        return Boolean(
          claim &&
          verifiedEvidenceStatuses.has(claim.status) &&
          claim.sourceRefs.some(
            (source) =>
              source.sourceType === "EVIDENCE_BLOCK" &&
              context.evidenceIds.has(source.sourceId),
          ),
        );
      });
      const procedureSupport = argument.supportingProceduralClaimIds.every(
        (id) => {
          const claim = proceduralClaims.get(id);
          return Boolean(
            claim &&
            claim.procedureVersionId === context.procedureVersionId &&
            claim.verificationStatus === "SUPPORTED" &&
            claim.support.length > 0,
          );
        },
      );
      sentences.push({
        claimIds: [...argument.supportingClaimIds],
        evidenceIds: argument.supportingClaimIds.flatMap(
          (id) =>
            claims
              .get(id)
              ?.sourceRefs.filter(
                (source) => source.sourceType === "EVIDENCE_BLOCK",
              )
              .map((source) => source.sourceId) ?? [],
        ),
        kind:
          materialFact && materialProcedure
            ? "FACT"
            : materialFact
              ? "FACT"
              : "PROCEDURE",
        material: materialFact || materialProcedure,
        proceduralClaimIds: [...argument.supportingProceduralClaimIds],
        sentenceId: `argument-${index + 1}`,
        text: argument.proposition,
        ...(materialFact && !claimSupport ? { unsupportedFact: true } : {}),
        ...(materialProcedure && !procedureSupport
          ? { unsupportedProcedure: true }
          : {}),
      } as GroundedSentence);
    }

    sentences.push({
      claimIds: [],
      evidenceIds: [],
      kind: "REQUEST",
      material: false,
      proceduralClaimIds: [],
      sentenceId: "conclusion",
      text: structured.conclusion,
    });

    const factual = sentences.filter(
      (sentence) => sentence.material && sentence.kind === "FACT",
    );
    const procedural = sentences.filter(
      (sentence) => sentence.material && sentence.kind === "PROCEDURE",
    );
    const unsupportedFacts = factual.filter(
      (sentence) =>
        sentence.claimIds.length === 0 ||
        sentence.evidenceIds.length === 0 ||
        !sentence.claimIds.every((id) => {
          const claim = claims.get(id);
          return Boolean(
            claim &&
            verifiedEvidenceStatuses.has(claim.status) &&
            claim.sourceRefs.some(
              (source) =>
                source.sourceType === "EVIDENCE_BLOCK" &&
                context.evidenceIds.has(source.sourceId),
            ),
          );
        }),
    );
    const unsupportedProcedure = procedural.filter(
      (sentence) =>
        sentence.proceduralClaimIds.length === 0 ||
        !sentence.proceduralClaimIds.every((id) => {
          const claim = proceduralClaims.get(id);
          return Boolean(
            claim &&
            claim.procedureVersionId === context.procedureVersionId &&
            claim.verificationStatus === "SUPPORTED" &&
            claim.support.length > 0,
          );
        }),
    );

    const result = {
      factualGroundingCoverage: ratio(
        factual.length - unsupportedFacts.length,
        factual.length,
      ),
      proceduralGroundingCoverage: ratio(
        procedural.length - unsupportedProcedure.length,
        procedural.length,
      ),
      unsupportedAssertionCount:
        unsupportedFacts.length + unsupportedProcedure.length,
      sentences,
    };
    this.observability?.metrics.increment("recourse_grounding_checks_total", {
      status: result.unsupportedAssertionCount === 0 ? "grounded" : "blocked",
    });
    this.observability?.metrics.observe(
      "recourse_factual_grounding_coverage",
      result.factualGroundingCoverage,
    );
    this.observability?.metrics.observe(
      "recourse_procedural_grounding_coverage",
      result.proceduralGroundingCoverage,
    );
    return result;
  }
}

function ratio(supported: number, total: number): number {
  return total === 0 ? 1 : Number((Math.max(0, supported) / total).toFixed(4));
}
