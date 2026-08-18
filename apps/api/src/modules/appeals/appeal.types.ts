import {
  type AppealRequestedOutcome,
  type SubmissionCapability,
  type ControlledActionType,
} from "@recourse/contracts";

import { type CaseActionDocument } from "./schemas/case-action.schema";

export interface AppealGenerationInput {
  requestedOutcome: AppealRequestedOutcome;
}

export interface GroundedSentence {
  sentenceId: string;
  text: string;
  kind: "FACT" | "PROCEDURE" | "REQUEST" | "CONTEXT";
  material: boolean;
  claimIds: string[];
  evidenceIds: string[];
  proceduralClaimIds: string[];
}

export interface GroundingResult {
  factualGroundingCoverage: number;
  proceduralGroundingCoverage: number;
  unsupportedAssertionCount: number;
  sentences: GroundedSentence[];
}

export interface PreparedAction {
  actionId: string;
  capability: SubmissionCapability;
  adapterName: string;
  payloadHash: string;
  destination: string | null;
  instructions: string[];
  payload: Record<string, unknown>;
  canExecute: boolean;
}

export interface ActionExecutionResult {
  actionId: string;
  capability: SubmissionCapability;
  providerReference: string | null;
  acceptedAt: Date | null;
  rawStatus: string;
}

export interface ActionVerificationResult {
  verified: boolean;
  providerReference: string | null;
  explanation: string;
}

export interface ActionAdapter {
  readonly name: string;
  capability(): SubmissionCapability;
  prepare(action: CaseActionDocument): Promise<PreparedAction>;
  execute(
    prepared: PreparedAction,
    idempotencyKey: string,
  ): Promise<ActionExecutionResult>;
  verify(result: ActionExecutionResult): Promise<ActionVerificationResult>;
}

export interface ActionRecommendation {
  actionType: ControlledActionType;
  capability: SubmissionCapability;
  available: boolean;
  canExecute: boolean;
  requiresApproval: boolean;
  reason: string;
  supportingClaimIds: string[];
  supportingEvidenceIds: string[];
  supportingProceduralClaimIds: string[];
  supportingSourceSnapshotIds: string[];
  officialDestination: string | null;
  instructions: string[];
  gates: string[];
}
