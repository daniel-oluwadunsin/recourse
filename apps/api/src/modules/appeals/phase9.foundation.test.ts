import { describe, expect, it } from "vitest";
import { Types } from "mongoose";

import { ActionPolicyEngine } from "./action-policy.service";
import {
  isIdempotentApprovalStatus,
  isIdempotentExecutionStatus,
} from "./action.service";
import { AssistedPortalAdapter } from "./adapters/assisted-portal.adapter";
import {
  isProcedureFresh,
  selectGroundedClaims,
} from "./appeal-composer.service";
import { GroundingVerifierService } from "./grounding-verifier.service";

describe("Phase 9 grounding and action safety", () => {
  it("blocks a fabricated user assertion from factual grounding", () => {
    const result = new GroundingVerifierService().verify(
      {
        arguments: [
          {
            proposition: "The user claims an unsupported fact.",
            requestedOutcome: "REVIEW_DECISION",
            supportingClaimIds: ["claim-user"],
            supportingEvidenceIds: [],
            supportingProceduralClaimIds: [],
          },
        ],
        conclusion: "Please review the decision.",
        introduction: "I request review.",
        requestedOutcome: "REVIEW_DECISION",
      },
      {
        claims: [
          {
            id: "claim-user",
            sourceRefs: [
              { sourceId: "user-input", sourceType: "USER_STATEMENT" },
            ],
            status: "USER_ASSERTED",
            text: "An unsupported fact.",
          },
        ],
        evidenceIds: new Set<string>(),
        procedureVersionId: "version-1",
        proceduralClaims: [],
      },
    );

    expect(result.factualGroundingCoverage).toBe(0);
    expect(result.unsupportedAssertionCount).toBe(1);
  });

  it("rejects an unsupported claim even when the proposition has a claim ID", () => {
    const result = new GroundingVerifierService().verify(
      {
        arguments: [
          {
            proposition:
              "The document says something that is not in an evidence block.",
            requestedOutcome: "REVIEW_DECISION",
            supportingClaimIds: ["claim-1"],
            supportingEvidenceIds: ["missing-block"],
            supportingProceduralClaimIds: [],
          },
        ],
        conclusion: "Please review.",
        introduction: "I request review.",
        requestedOutcome: "REVIEW_DECISION",
      },
      {
        claims: [
          {
            id: "claim-1",
            sourceRefs: [
              { sourceId: "missing-block", sourceType: "EVIDENCE_BLOCK" },
            ],
            status: "VERIFIED_DOCUMENT",
            text: "A claim.",
          },
        ],
        evidenceIds: new Set<string>(),
        procedureVersionId: "version-1",
        proceduralClaims: [],
      },
    );

    expect(result.unsupportedAssertionCount).toBe(1);
  });

  it("treats an expired procedure as unsafe", () => {
    const config = { get: () => 24 } as never;
    expect(
      isProcedureFresh(
        {
          status: "ACTIVE",
          lastVerifiedAt: new Date("2020-01-01"),
        } as never,
        config,
        new Date("2020-01-03").getTime(),
      ),
    ).toBe(false);
  });

  it("requires approval and never advertises an unconfigured email action", () => {
    const decision = new ActionPolicyEngine().evaluate({
      actionType: "SUBMIT_APPEAL",
      appealStatus: "AWAITING_APPROVAL",
      capability: "EMAIL",
      caseStatus: "AWAITING_USER_APPROVAL",
      criticalRequirementGap: false,
      deletedAt: null,
      factualGroundingCoverage: 1,
      instructions: [],
      officialDestination: null,
      procedureStatus: "ACTIVE",
      procedureVersionFresh: true,
      procedureVersionMatchesCase: true,
      proceduralGroundingCoverage: 1,
      supportingClaimIds: ["claim-1"],
      supportingEvidenceIds: ["evidence-1"],
      supportingProceduralClaimIds: ["procedure-claim-1"],
      supportingSourceSnapshotIds: ["source-1"],
      unresolvedContradiction: false,
      unsupportedAssertionCount: 0,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.recommendation.gates).toEqual(
      expect.arrayContaining([
        "USER_APPROVAL_REQUIRED",
        "EMAIL_PROVIDER_UNAVAILABLE",
      ]),
    );
  });

  it("makes approval and duplicate execution requests idempotent", () => {
    expect(isIdempotentApprovalStatus("APPROVED")).toBe(true);
    expect(isIdempotentApprovalStatus("AWAITING_APPROVAL")).toBe(false);
    expect(isIdempotentExecutionStatus("SUCCEEDED")).toBe(true);
    expect(isIdempotentExecutionStatus("EXECUTING")).toBe(true);
    expect(isIdempotentExecutionStatus("APPROVED")).toBe(false);
  });

  it("reports assisted preparation as unverified because no submission occurred", async () => {
    const result = await new AssistedPortalAdapter().verify({
      acceptedAt: null,
      actionId: "action-1",
      capability: "ASSISTED_PORTAL",
      providerReference: null,
      rawStatus: "NOT_SUBMITTED",
    });

    expect(result.verified).toBe(false);
    expect(result.providerReference).toBeNull();
  });

  it("bounds appeal facts and removes repeated extraction variants", () => {
    const claims = [
      {
        _id: new Types.ObjectId("000000000000000000000001"),
        confidence: 0.99,
        normalizedText: "the channel was suspended on august 18 2026",
        sourceRefs: [],
        text: "The channel was suspended on August 18, 2026.",
      },
      {
        _id: new Types.ObjectId("000000000000000000000002"),
        confidence: 0.95,
        normalizedText: "channel was suspended on august 18 2026",
        sourceRefs: [],
        text: "Channel was suspended on August 18, 2026.",
      },
      {
        _id: new Types.ObjectId("000000000000000000000003"),
        confidence: 0.9,
        normalizedText: "the notice alleged repeated policy violations",
        sourceRefs: [],
        text: "The notice alleged repeated policy violations.",
      },
    ];

    const selected = selectGroundedClaims(claims, 2);

    expect(selected).toHaveLength(2);
    expect(selected.map((claim) => claim._id.toString())).toEqual([
      "000000000000000000000001",
      "000000000000000000000003",
    ]);
  });
});
