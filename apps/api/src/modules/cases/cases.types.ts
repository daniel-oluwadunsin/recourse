import {
  type CaseEventActorType,
  type CaseEventType,
  type CaseStatus,
  type DecisionCorrection,
  type DecisionFieldSnapshot,
  type DecisionType,
  type FinancialImpact,
  type JurisdictionRef,
  type RelationshipType,
} from "@recourse/contracts";

import { type CaseDocument } from "./schemas/case.schema";
import { type CaseEventDocument } from "./schemas/case-event.schema";
import { type DecisionDocument } from "./schemas/decision.schema";

export interface CaseActor {
  actorId: string | null;
  actorType: CaseEventActorType;
  correlationId?: string;
}

export interface CreateCaseInput {
  title: string;
  institutionName: string | null;
  relationship: RelationshipType | null;
  decisionType: DecisionType | null;
  statedReason: string | null;
  decisionDate: Date | null;
  notificationDate: Date | null;
  financialImpact: FinancialImpact | null;
  jurisdiction: JurisdictionRef | null;
}

export interface UpdateCaseInput {
  expectedRevision: number;
  title?: string;
  corrections?: DecisionCorrection;
}

export interface AppendCaseEventInput {
  caseId: string;
  type: CaseEventType;
  actor: CaseActor;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface CasePageCursor {
  version: 1;
  updatedAt: string;
  id: string;
}

export interface EventPageCursor {
  version: 1;
  sequence: number;
}

export interface PublicDecision {
  id: string;
  rawExtractedFields: DecisionFieldSnapshot;
  userCorrectedFields: DecisionCorrection;
  effectiveFields: DecisionFieldSnapshot;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicCase {
  id: string;
  caseKey: string;
  title: string;
  institutionId: string | null;
  institutionNameRaw: string | null;
  relationship: RelationshipType | null;
  decisionType: DecisionType | null;
  jurisdiction: JurisdictionRef | null;
  statedReason: string | null;
  decisionDate: Date | null;
  notificationDate: Date | null;
  financialImpact: FinancialImpact | null;
  status: CaseStatus;
  currentStage: CaseStatus;
  readiness: CaseDocument["readiness"];
  activeProcedureId: string | null;
  activeProcedureVersionId: string | null;
  graphVersion: number;
  openCriticalGapCount: number;
  contradictionCount: number;
  nextRecommendedActionId: string | null;
  revision: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  decision?: PublicDecision;
}

export interface PublicCaseEvent {
  id: string;
  caseId: string;
  sequence: number;
  type: CaseEventType;
  actorType: CaseEventActorType;
  actorId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface CaseTransitionResult {
  case: CaseDocument;
  event: CaseEventDocument;
  idempotent: boolean;
}

export interface CaseWithDecision {
  case: CaseDocument;
  decision: DecisionDocument;
}
