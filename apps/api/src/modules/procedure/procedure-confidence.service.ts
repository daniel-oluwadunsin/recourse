import { Injectable } from "@nestjs/common";

import {
  type SourceAuthorityTier,
  type ProceduralClaimVerificationStatus,
} from "@recourse/contracts";

export interface ProcedureConfidenceResult {
  confidence: number;
  factors: {
    sourceAuthority: number;
    verificationCoverage: number;
    scopeMatch: number;
    freshness: number;
    conflictPenalty: number;
    explanation: string;
  };
}

@Injectable()
export class ProcedureConfidenceService {
  calculate(input: {
    authorityTiers: SourceAuthorityTier[];
    verificationStatuses: ProceduralClaimVerificationStatus[];
    scopeMatches: boolean;
    freshestAt: Date | null;
    conflictCount: number;
  }): ProcedureConfidenceResult {
    const sourceAuthority =
      input.authorityTiers.length === 0
        ? 0
        : input.authorityTiers.reduce(
            (sum, tier) => sum + authorityWeight(tier),
            0,
          ) / input.authorityTiers.length;
    const verificationCoverage =
      input.verificationStatuses.length === 0
        ? 0
        : input.verificationStatuses.filter((status) => status === "SUPPORTED")
            .length / input.verificationStatuses.length;
    const scopeMatch = input.scopeMatches ? 1 : 0;
    const ageDays = input.freshestAt
      ? Math.max(0, (Date.now() - input.freshestAt.getTime()) / 86_400_000)
      : Number.POSITIVE_INFINITY;
    const freshness = Number.isFinite(ageDays)
      ? Math.max(0, Math.min(1, 1 - ageDays / 365))
      : 0;
    const conflictPenalty = Math.min(0.5, input.conflictCount * 0.15);
    const raw =
      0.4 * sourceAuthority +
      0.35 * verificationCoverage +
      0.15 * scopeMatch +
      0.1 * freshness -
      conflictPenalty;
    const confidence = Math.max(0, Math.min(1, Number(raw.toFixed(4))));
    return {
      confidence,
      factors: {
        sourceAuthority: Number(sourceAuthority.toFixed(4)),
        verificationCoverage: Number(verificationCoverage.toFixed(4)),
        scopeMatch,
        freshness: Number(freshness.toFixed(4)),
        conflictPenalty: Number(conflictPenalty.toFixed(4)),
        explanation:
          "0.40 source authority + 0.35 verified claim coverage + 0.15 scope match + 0.10 freshness - conflict penalty.",
      },
    };
  }
}

function authorityWeight(tier: SourceAuthorityTier): number {
  switch (tier) {
    case "TIER_1_OFFICIAL_INSTITUTION":
    case "TIER_1_OFFICIAL_GOVERNMENT":
    case "TIER_1_REGULATOR_ADR":
      return 1;
    case "TIER_2_REPUTABLE_SECONDARY":
      return 0.45;
    default:
      return 0;
  }
}
