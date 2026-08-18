import { Injectable } from "@nestjs/common";

import {
  type ActionStatus,
  type AppealStatus,
  type CaseStatus,
  type ControlledActionType,
  type ProcedureStatus,
  type SubmissionCapability,
} from "@recourse/contracts";

import { type ActionRecommendation } from "./appeal.types";

export interface ActionPolicyInput {
  caseStatus: CaseStatus;
  deletedAt: Date | null;
  appealStatus: AppealStatus | null;
  unsupportedAssertionCount: number;
  factualGroundingCoverage: number;
  proceduralGroundingCoverage: number;
  procedureStatus: ProcedureStatus | null;
  procedureVersionMatchesCase: boolean;
  procedureVersionFresh: boolean;
  criticalRequirementGap: boolean;
  unresolvedContradiction: boolean;
  capability: SubmissionCapability;
  actionType: ControlledActionType;
  officialDestination: string | null;
  instructions: string[];
  supportingClaimIds: string[];
  supportingEvidenceIds: string[];
  supportingProceduralClaimIds: string[];
  supportingSourceSnapshotIds: string[];
}

export interface ActionPolicyDecision {
  allowed: boolean;
  recommendation: ActionRecommendation;
}

@Injectable()
export class ActionPolicyEngine {
  evaluate(input: ActionPolicyInput): ActionPolicyDecision {
    const gates: string[] = [];
    const reasons: string[] = [];

    if (input.deletedAt) gates.push("CASE_DELETED");
    if (
      input.actionType === "SUBMIT_APPEAL" &&
      input.appealStatus !== "APPROVED"
    ) {
      gates.push("USER_APPROVAL_REQUIRED");
    }
    if (input.unsupportedAssertionCount > 0) {
      gates.push("UNSUPPORTED_APPEAL_ASSERTION");
    }
    if (input.supportingClaimIds.length === 0) {
      gates.push("NO_GROUNDED_CASE_CLAIMS");
    }
    if (
      input.supportingProceduralClaimIds.length === 0 ||
      input.supportingSourceSnapshotIds.length === 0
    ) {
      gates.push("NO_VERIFIED_PROCEDURE_SUPPORT");
    }
    if (input.factualGroundingCoverage < 1) {
      gates.push("FACTUAL_GROUNDING_INCOMPLETE");
    }
    if (input.proceduralGroundingCoverage < 1) {
      gates.push("PROCEDURAL_GROUNDING_INCOMPLETE");
    }
    if (input.procedureStatus !== "ACTIVE") gates.push("PROCEDURE_NOT_ACTIVE");
    if (!input.procedureVersionMatchesCase)
      gates.push("PROCEDURE_SCOPE_MISMATCH");
    if (!input.procedureVersionFresh) gates.push("PROCEDURE_VERSION_EXPIRED");
    if (input.criticalRequirementGap) gates.push("CRITICAL_EVIDENCE_GAP");
    if (input.unresolvedContradiction) gates.push("UNRESOLVED_CONTRADICTION");
    if (
      input.actionType === "SUBMIT_APPEAL" &&
      !["READY_TO_APPEAL", "AWAITING_USER_APPROVAL"].includes(input.caseStatus)
    ) {
      gates.push("CASE_NOT_IN_APPROVAL_STAGE");
    }

    let available = true;
    let canExecute = false;
    switch (input.capability) {
      case "ASSISTED_PORTAL":
        canExecute = false;
        reasons.push(
          "The verified official destination and instructions are available, but the user must complete the submission on the institution site.",
        );
        if (!input.officialDestination || input.instructions.length === 0) {
          available = false;
          gates.push("VERIFIED_ASSISTED_DESTINATION_MISSING");
        }
        break;
      case "EMAIL":
        available = false;
        reasons.push("No real transactional email provider is configured.");
        gates.push("EMAIL_PROVIDER_UNAVAILABLE");
        break;
      case "AUTO_API":
        available = false;
        reasons.push(
          "No supported institution API adapter is configured for this case.",
        );
        gates.push("REAL_API_ADAPTER_UNAVAILABLE");
        break;
      case "MANUAL":
        canExecute = false;
        reasons.push(
          "The user must complete the action manually using verified instructions.",
        );
        if (input.instructions.length === 0) {
          available = false;
          gates.push("VERIFIED_MANUAL_INSTRUCTIONS_MISSING");
        }
        break;
      case "UNSUPPORTED":
        available = false;
        reasons.push(
          "The verified procedure does not expose a supported submission route.",
        );
        gates.push("UNSUPPORTED_CAPABILITY");
        break;
    }

    const allowed = gates.length === 0 && available;
    if (!allowed && reasons.length === 0) {
      reasons.push("One or more safety gates prevent this action.");
    }

    return {
      allowed,
      recommendation: {
        actionType: input.actionType,
        available,
        canExecute,
        capability: input.capability,
        gates,
        instructions: input.instructions,
        officialDestination: input.officialDestination,
        reason: reasons.join(" "),
        requiresApproval: input.actionType === "SUBMIT_APPEAL",
        supportingClaimIds: input.supportingClaimIds,
        supportingEvidenceIds: input.supportingEvidenceIds,
        supportingProceduralClaimIds: input.supportingProceduralClaimIds,
        supportingSourceSnapshotIds: input.supportingSourceSnapshotIds,
      },
    };
  }
}

export function actionCanBeExecuted(status: ActionStatus): boolean {
  return status === "APPROVED" || status === "PREPARED";
}
