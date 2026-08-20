import type { Edge, Node } from "@xyflow/react";

export type UserRole = "USER" | "STAFF" | "ADMIN";
export type CaseStatus =
  | "INTAKE"
  | "CLASSIFYING"
  | "PROCEDURE_RESOLUTION"
  | "EVIDENCE_COLLECTION"
  | "CASE_ANALYSIS"
  | "READY_TO_APPEAL"
  | "AWAITING_USER_APPROVAL"
  | "SUBMITTED"
  | "AWAITING_RESPONSE"
  | "RESPONSE_RECEIVED"
  | "REPLANNING"
  | "RESOLVED"
  | "EXHAUSTED"
  | "NEEDS_HUMAN";
export type RelationshipType =
  | "SELLER"
  | "DRIVER"
  | "CREATOR"
  | "MERCHANT"
  | "CONSUMER"
  | "OTHER"
  | "UNKNOWN";
export type DecisionType =
  | "SUSPENSION"
  | "RESTRICTION"
  | "DEACTIVATION"
  | "DEMONETIZATION"
  | "ACCOUNT_TERMINATION"
  | "PAYMENT_HOLD"
  | "VERIFICATION_FAILURE"
  | "CONTENT_REMOVAL"
  | "LISTING_REMOVAL"
  | "OTHER"
  | "UNKNOWN";
export type EvidenceProcessingStatus =
  | "UPLOADING"
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "DELETING"
  | "DELETED";
export type EvidenceKind =
  | "DECISION_NOTICE"
  | "SUPPORTING_DOCUMENT"
  | "SCREENSHOT"
  | "EMAIL"
  | "TEXT"
  | "INSTITUTION_RESPONSE"
  | "OTHER";
export type ClaimEvidenceStatus =
  | "VERIFIED_DOCUMENT"
  | "EXTERNAL_VERIFIED"
  | "USER_ASSERTED"
  | "INFERRED"
  | "CONTRADICTED"
  | "UNKNOWN";

export interface User {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  status: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  rawExtractedFields: Record<string, unknown>;
  userCorrectedFields: Record<string, unknown>;
  effectiveFields: Record<string, unknown>;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface Readiness {
  score: number | null;
  caps: string[];
  factors: Array<{
    key: string;
    status: "SATISFIED" | "MISSING" | "UNCERTAIN" | "CONFLICTED";
    scoreImpact: number;
    reason: string;
  }>;
  version?: string;
  computedAt?: string | null;
}

export interface UnresolvedFact {
  fact: string;
  resolutionOwner: "USER" | "RECOURSE" | "INSTITUTION";
  resolutionAction: string;
  userQuestion: string | null;
  blocking: boolean;
  inputRefs: string[];
}

export interface CaseAnalysis {
  centralIssues: string[];
  unresolvedFacts: UnresolvedFact[];
  recommendedNextSteps: string[];
  supportedClaimIds: string[];
  needsHumanReview: boolean;
  modelRunId: string | null;
  computedAt: string;
  factAnswers?: Array<{
    question: string;
    answer: string;
    answeredAt: string;
    evidenceId: string;
  }>;
}

export interface CaseRecord {
  id: string;
  caseKey: string;
  title: string;
  institutionId: string | null;
  institutionNameRaw: string | null;
  relationship: RelationshipType | null;
  decisionType: DecisionType | null;
  jurisdiction: {
    countryCode: string | null;
    regionCode: string | null;
    source: string | null;
  } | null;
  statedReason: string | null;
  decisionDate: string | null;
  notificationDate: string | null;
  financialImpact: { amount: string | null; currency: string | null } | null;
  status: CaseStatus;
  currentStage: CaseStatus;
  readiness: Readiness | null;
  activeProcedureId: string | null;
  activeProcedureVersionId: string | null;
  graphVersion: number;
  openCriticalGapCount: number;
  contradictionCount: number;
  nextRecommendedActionId: string | null;
  revision: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  decision?: Decision;
}

export interface CaseEvent {
  id: string;
  caseId: string;
  sequence: number;
  type: string;
  actorType: string;
  actorId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Evidence {
  id: string;
  caseId: string;
  kind: EvidenceKind;
  label: string | null;
  originalFilename: string | null;
  mimeType: string;
  extension: string;
  byteSize: number;
  sha256: string | null;
  processingStatus: EvidenceProcessingStatus;
  extractionMethod: string | null;
  pageCount: number | null;
  processingErrorCode: string | null;
  extractionMetadata: Record<string, unknown> | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceBlock {
  id?: string;
  evidenceId?: string;
  blockIndex?: number;
  blockType?: string;
  pageNumber: number | null;
  text: string;
  boundingBox?: Record<string, number> | null;
  provenance?: Record<string, unknown> | null;
}

export interface Procedure {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  relationship: RelationshipType;
  decisionType: DecisionType;
  jurisdictionKey: string | null;
  scopeKey: string;
  currentVersionId: string | null;
  status: string;
  firstSeenAt: string;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcedureVersion {
  id: string;
  procedureId: string;
  version: number;
  status?: string;
  contentSha256?: string;
  confidence?: number;
  sourceSnapshotIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SourceSnapshot {
  id: string;
  canonicalUrl: string;
  domain: string;
  authorityTier: string;
  retrievedAt: string;
  contentSha256: string;
  paragraphs: Array<{ paragraphId: string; text: string }>;
  sourceMetadata?: Record<string, unknown> | null;
  status?: string;
}

export interface ProceduralClaim {
  id: string;
  procedureVersionId: string;
  claimKey: string;
  type: string;
  humanText: string;
  normalizedValue: Record<string, unknown>;
  verificationStatus:
    "SUPPORTED" | "CONTRADICTED" | "AMBIGUOUS" | "NOT_FOUND" | string;
  verificationExplanation: string | null;
  confidence: number;
  authorityTier: string;
  support: Array<{ sourceSnapshotId: string; paragraphIds: string[] }>;
  conflictsWith?: string[];
}

export interface Claim {
  id: string;
  caseId: string;
  text: string;
  normalizedType: string | null;
  normalizedValue: string | null;
  status: ClaimEvidenceStatus;
  resolutionStatus: string;
  confidence: number;
  sourceRefs: Array<{
    sourceType: string;
    sourceId: string;
    location?: Record<string, unknown> | null;
  }>;
  entityRefs: string[];
  updatedAt: string;
}

export interface RequirementMatch {
  id: string;
  requirementKey: string;
  requirementText: string;
  critical: boolean;
  status: "SATISFIED" | "MISSING" | "UNCERTAIN" | "CONFLICTED" | string;
  evidenceIds: string[];
  claimIds: string[];
  reason: string;
  confidence: number;
}

export interface Contradiction {
  id: string;
  claimAId: string;
  claimBId: string;
  kind: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED" | string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
  deterministicCandidate: boolean;
  resolutionRefs: string[];
}

export interface TimelineEvent {
  id: string;
  eventKey: string;
  eventText: string;
  rawDateText: string | null;
  normalizedDate: string | null;
  datePrecision: string;
  sourceRefs: Array<{
    sourceType: string;
    sourceId: string;
    location?: Record<string, unknown> | null;
  }>;
  confidence: number;
}

export interface GraphResponse {
  version: number;
  nodes: Array<{
    id: string;
    caseId?: string;
    nodeType: string;
    refType: string;
    refId: string;
    label: string;
    metadata: Record<string, unknown>;
    version: number;
  }>;
  edges: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    edgeType: string;
    confidence: number;
    sourceRefs: string[];
    version: number;
  }>;
}

export type GraphFlowNode = Node<{
  label: string;
  nodeType: string;
  metadata: Record<string, unknown>;
}>;
export type GraphFlowEdge = Edge<{ edgeType: string; confidence: number }>;

export interface Appeal {
  id: string;
  caseId: string;
  sequence: number;
  version: number;
  status: string;
  procedureVersionId: string;
  structuredArguments: {
    introduction: string;
    arguments: Array<{
      proposition: string;
      supportingClaimIds: string[];
      supportingEvidenceIds: string[];
      supportingProceduralClaimIds: string[];
      requestedOutcome: string;
    }>;
    requestedOutcome: string;
    conclusion: string;
  };
  renderedBody: string;
  title: string;
  factualGroundingCoverage: number;
  proceduralGroundingCoverage: number;
  unsupportedAssertionCount: number;
  attachmentEvidenceIds: string[];
  attachmentRequirementIds: string[];
  attachmentChecklist: Array<Record<string, unknown>>;
  contentHash: string;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseAction {
  id: string;
  caseId: string;
  appealId: string | null;
  actionType: string;
  capability:
    "AUTO_API" | "EMAIL" | "ASSISTED_PORTAL" | "MANUAL" | "UNSUPPORTED";
  status: string;
  verificationStatus: string;
  requiresApproval: boolean;
  idempotencyKey: string;
  recommendation: ActionRecommendation;
  preparedPayload: Record<string, unknown> | null;
  adapterName: string | null;
  externalReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionRecommendation {
  actionType: string;
  available: boolean;
  canExecute: boolean;
  capability: string;
  gates: string[];
  instructions: string[];
  officialDestination: string | null;
  reason: string;
  requiresApproval: boolean;
  supportingClaimIds: string[];
  supportingEvidenceIds: string[];
  supportingProceduralClaimIds: string[];
  supportingSourceSnapshotIds: string[];
}

export interface CaseResponse {
  id: string;
  caseId: string | null;
  providerMessageId: string;
  fromAddress: string;
  subject: string | null;
  bodyText?: string;
  associationStatus: string;
  processingStatus: string;
  outcome: string | null;
  outcomeConfidence: number | null;
  statedReason: string | null;
  addressedClaimIds: string[];
  unaddressedClaimIds: string[];
  newIssues: Array<Record<string, unknown>>;
  requestedEvidence: string[];
  mentionedDeadlines: string[];
  recommendedOutcome: string | null;
  replanNextAction: string | null;
  replanRationale: string | null;
  receivedAt: string;
  analyzedAt: string | null;
}

export interface Deadline {
  id: string;
  caseId: string;
  type: string;
  triggerType: string;
  dueAt: string | null;
  timezone: string;
  businessDayRule: string;
  status: string;
  confidence: number;
  sourceClaimId: string | null;
  sourceSnapshotId: string | null;
  explanation: string | null;
}

export interface Notification {
  id: string;
  caseId: string | null;
  type: string;
  title: string;
  body: string;
  channels: string[];
  readAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type ApiCase = CaseRecord;
export type FlowGraph = {
  nodes: GraphFlowNode[];
  edges: GraphFlowEdge[];
  version: number;
};
