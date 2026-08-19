import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "CONFLICT",
  "FORBIDDEN",
  "TOO_MANY_REQUESTS",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string(),
  checks: z.record(z.string(), z.literal("ok")),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const caseStatusValues = [
  "INTAKE",
  "CLASSIFYING",
  "PROCEDURE_RESOLUTION",
  "EVIDENCE_COLLECTION",
  "CASE_ANALYSIS",
  "READY_TO_APPEAL",
  "AWAITING_USER_APPROVAL",
  "SUBMITTED",
  "AWAITING_RESPONSE",
  "RESPONSE_RECEIVED",
  "REPLANNING",
  "RESOLVED",
  "EXHAUSTED",
  "NEEDS_HUMAN",
] as const;

export const caseStatusSchema = z.enum(caseStatusValues);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

export const relationshipTypeValues = [
  "SELLER",
  "DRIVER",
  "CREATOR",
  "MERCHANT",
  "CONSUMER",
  "OTHER",
  "UNKNOWN",
] as const;

export const relationshipTypeSchema = z.enum(relationshipTypeValues);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const decisionTypeValues = [
  "SUSPENSION",
  "RESTRICTION",
  "DEACTIVATION",
  "DEMONETIZATION",
  "ACCOUNT_TERMINATION",
  "PAYMENT_HOLD",
  "VERIFICATION_FAILURE",
  "CONTENT_REMOVAL",
  "LISTING_REMOVAL",
  "OTHER",
  "UNKNOWN",
] as const;

export const decisionTypeSchema = z.enum(decisionTypeValues);
export type DecisionType = z.infer<typeof decisionTypeSchema>;

export const claimEvidenceStatusValues = [
  "VERIFIED_DOCUMENT",
  "EXTERNAL_VERIFIED",
  "USER_ASSERTED",
  "INFERRED",
  "CONTRADICTED",
  "UNKNOWN",
] as const;

export const claimEvidenceStatusSchema = z.enum(claimEvidenceStatusValues);
export type ClaimEvidenceStatus = z.infer<typeof claimEvidenceStatusSchema>;

export const submissionCapabilityValues = [
  "AUTO_API",
  "EMAIL",
  "ASSISTED_PORTAL",
  "MANUAL",
  "UNSUPPORTED",
] as const;

export const submissionCapabilitySchema = z.enum(submissionCapabilityValues);
export type SubmissionCapability = z.infer<typeof submissionCapabilitySchema>;

export const controlledActionTypeValues = [
  "COLLECT_EVIDENCE",
  "REQUEST_CLARIFICATION",
  "WAIT_FOR_RESPONSE",
  "FOLLOW_UP",
  "GENERATE_APPEAL",
  "SUBMIT_APPEAL",
  "SUBMIT_SECOND_REVIEW",
  "USE_EXTERNAL_REMEDY",
  "ESCALATE_TO_HUMAN",
  "CLOSE_RESOLVED",
  "CLOSE_EXHAUSTED",
] as const;

export const controlledActionTypeSchema = z.enum(controlledActionTypeValues);
export type ControlledActionType = z.infer<typeof controlledActionTypeSchema>;

export const appealStatusValues = [
  "DRAFT",
  "AWAITING_APPROVAL",
  "APPROVED",
  "SUBMITTED",
  "BLOCKED",
  "CANCELLED",
] as const;
export const appealStatusSchema = z.enum(appealStatusValues);
export type AppealStatus = z.infer<typeof appealStatusSchema>;

export const appealRequestedOutcomeValues = [
  "REVIEW_DECISION",
  "REINSTATE_ACCESS",
  "REMOVE_RESTRICTION",
  "RELEASE_FUNDS",
  "RESTORE_CONTENT",
  "CLARIFY_REASON",
  "OTHER",
] as const;
export const appealRequestedOutcomeSchema = z.enum(
  appealRequestedOutcomeValues,
);
export type AppealRequestedOutcome = z.infer<
  typeof appealRequestedOutcomeSchema
>;

export const appealArgumentSchema = z.object({
  proposition: z.string().trim().min(1).max(4000),
  supportingClaimIds: z.array(z.string().min(1)).max(50),
  supportingEvidenceIds: z.array(z.string().min(1)).max(100),
  supportingProceduralClaimIds: z.array(z.string().min(1)).max(50),
  requestedOutcome: appealRequestedOutcomeSchema,
});
export type AppealArgument = z.infer<typeof appealArgumentSchema>;

export const appealStructuredArgumentsSchema = z.object({
  introduction: z.string().trim().min(1).max(4000),
  arguments: z.array(appealArgumentSchema).min(1).max(20),
  requestedOutcome: appealRequestedOutcomeSchema,
  conclusion: z.string().trim().min(1).max(4000),
});
export type AppealStructuredArguments = z.infer<
  typeof appealStructuredArgumentsSchema
>;

export const actionStatusValues = [
  "PROPOSED",
  "AWAITING_APPROVAL",
  "APPROVED",
  "PREPARING",
  "PREPARED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "VERIFICATION_FAILED",
  "CANCELLED",
  "UNAVAILABLE",
] as const;
export const actionStatusSchema = z.enum(actionStatusValues);
export type ActionStatus = z.infer<typeof actionStatusSchema>;

export const actionVerificationStatusValues = [
  "PENDING",
  "VERIFIED",
  "FAILED",
  "NOT_APPLICABLE",
] as const;
export const actionVerificationStatusSchema = z.enum(
  actionVerificationStatusValues,
);
export type ActionVerificationStatus = z.infer<
  typeof actionVerificationStatusSchema
>;

export const caseEventActorTypeValues = [
  "USER",
  "RECOURSE",
  "EXTERNAL",
  "SYSTEM",
] as const;

export const caseEventActorTypeSchema = z.enum(caseEventActorTypeValues);
export type CaseEventActorType = z.infer<typeof caseEventActorTypeSchema>;

export const caseEventTypeValues = [
  "CASE_CREATED",
  "CASE_UPDATED",
  "DECISION_CORRECTED",
  "CASE_STATUS_CHANGED",
  "CASE_DELETED",
  "CLASSIFICATION_COMPLETE",
  "PROCEDURE_RESOLVED",
  "CASE_ANALYSIS_COMPLETED",
  "RESPONSE_RECEIVED",
  "RESPONSE_ANALYZED",
  "CASE_REPLANNING",
  "CASE_RESOLVED",
  "CASE_EXHAUSTED",
  "CASE_NEEDS_HUMAN",
  "EVIDENCE_UPLOAD_INTENT_CREATED",
  "EVIDENCE_UPLOADED",
  "EVIDENCE_PROCESSING_STARTED",
  "EVIDENCE_PROCESSED",
  "EVIDENCE_FAILED",
  "EVIDENCE_DELETED",
  "CLAIMS_UPDATED",
  "TIMELINE_UPDATED",
  "CONTRADICTION_DISCOVERED",
  "CASE_GAP_DISCOVERED",
  "READINESS_UPDATED",
  "GRAPH_REBUILT",
  "APPEAL_GENERATED",
  "ACTION_AWAITING_APPROVAL",
  "ACTION_COMPLETED",
  "ACTION_VERIFICATION_FAILED",
  "ACTION_CANCELLED",
  "DEADLINE_CREATED",
  "DEADLINE_CHANGED",
  "DEADLINE_EXPIRED",
  "NOTIFICATION_CREATED",
  "NOTIFICATION_SENT",
] as const;

export const caseEventTypeSchema = z.enum(caseEventTypeValues);
export type CaseEventType = z.infer<typeof caseEventTypeSchema>;

export const evidenceKindValues = [
  "DECISION_NOTICE",
  "SUPPORTING_DOCUMENT",
  "SCREENSHOT",
  "EMAIL",
  "TEXT",
  "INSTITUTION_RESPONSE",
  "OTHER",
] as const;

export const evidenceKindSchema = z.enum(evidenceKindValues);
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;

export const evidenceProcessingStatusValues = [
  "UPLOADING",
  "UPLOADED",
  "QUEUED",
  "PROCESSING",
  "READY",
  "UNSUPPORTED",
  "FAILED",
  "DELETING",
  "DELETED",
] as const;

export const evidenceProcessingStatusSchema = z.enum(
  evidenceProcessingStatusValues,
);
export type EvidenceProcessingStatus = z.infer<
  typeof evidenceProcessingStatusSchema
>;

export const evidenceExtractionMethodValues = [
  "PDF_TEXT",
  "DOCX_TEXT",
  "EML_TEXT",
  "PLAIN_TEXT",
  "IMAGE_METADATA",
  "MULTIMODAL_FALLBACK",
  "NONE",
] as const;

export const evidenceExtractionMethodSchema = z.enum(
  evidenceExtractionMethodValues,
);
export type EvidenceExtractionMethod = z.infer<
  typeof evidenceExtractionMethodSchema
>;

export const evidenceBlockTypeValues = [
  "TEXT",
  "PAGE_TEXT",
  "EMAIL_BODY",
  "IMAGE_METADATA",
] as const;

export const evidenceBlockTypeSchema = z.enum(evidenceBlockTypeValues);
export type EvidenceBlockType = z.infer<typeof evidenceBlockTypeSchema>;

export const claimSourceTypeValues = [
  "EVIDENCE_BLOCK",
  "PROCEDURAL_CLAIM",
  "USER_STATEMENT",
] as const;
export const claimSourceTypeSchema = z.enum(claimSourceTypeValues);
export type ClaimSourceType = z.infer<typeof claimSourceTypeSchema>;

export const claimResolutionStatusValues = [
  "OPEN",
  "RESOLVED",
  "MERGED",
] as const;
export const claimResolutionStatusSchema = z.enum(claimResolutionStatusValues);
export type ClaimResolutionStatus = z.infer<typeof claimResolutionStatusSchema>;

export const contradictionStatusValues = [
  "OPEN",
  "RESOLVED",
  "EXPLAINABLE",
  "UNKNOWN",
] as const;
export const contradictionStatusSchema = z.enum(contradictionStatusValues);
export type ContradictionStatus = z.infer<typeof contradictionStatusSchema>;

export const contradictionKindValues = [
  "DATE_MISMATCH",
  "NUMBER_MISMATCH",
  "IDENTIFIER_MISMATCH",
  "ENTITY_NAME_MISMATCH",
  "SEMANTIC_CONFLICT",
  "PROCEDURE_CONFLICT",
] as const;
export const contradictionKindSchema = z.enum(contradictionKindValues);
export type ContradictionKind = z.infer<typeof contradictionKindSchema>;

export const evidenceRequirementMatchStatusValues = [
  "SATISFIED",
  "PARTIAL",
  "MISSING",
  "NOT_APPLICABLE",
  "UNCERTAIN",
] as const;
export const evidenceRequirementMatchStatusSchema = z.enum(
  evidenceRequirementMatchStatusValues,
);
export type EvidenceRequirementMatchStatus = z.infer<
  typeof evidenceRequirementMatchStatusSchema
>;

export const graphNodeTypeValues = [
  "CASE",
  "EVIDENCE",
  "EVIDENCE_BLOCK",
  "CLAIM",
  "TIMELINE_EVENT",
  "PROCEDURE",
  "PROCEDURAL_CLAIM",
  "REQUIREMENT",
  "CONTRADICTION",
  "ENTITY",
] as const;
export const graphNodeTypeSchema = z.enum(graphNodeTypeValues);
export type GraphNodeType = z.infer<typeof graphNodeTypeSchema>;

export const graphEdgeTypeValues = [
  "HAS_EVIDENCE",
  "HAS_BLOCK",
  "SUPPORTS",
  "MENTIONS",
  "OCCURRED_ON",
  "APPLIES_TO",
  "REQUIRES",
  "CONTRADICTS",
  "RESOLVES",
  "SAME_ENTITY",
] as const;
export const graphEdgeTypeSchema = z.enum(graphEdgeTypeValues);
export type GraphEdgeType = z.infer<typeof graphEdgeTypeSchema>;

export const timelineDatePrecisionValues = [
  "EXACT",
  "APPROXIMATE",
  "UNKNOWN",
] as const;
export const timelineDatePrecisionSchema = z.enum(timelineDatePrecisionValues);
export type TimelineDatePrecision = z.infer<typeof timelineDatePrecisionSchema>;
export const evidenceErrorCodeValues = [
  "INTEGRITY_MISMATCH",
  "MIME_SIGNATURE_MISMATCH",
  "DUPLICATE_CONTENT",
  "PARSER_FAILED",
  "PAGE_LIMIT_EXCEEDED",
  "PIXEL_LIMIT_EXCEEDED",
  "UNSUPPORTED_FORMAT",
  "DELETION_FAILED",
] as const;

export const evidenceErrorCodeSchema = z.enum(evidenceErrorCodeValues);
export type EvidenceErrorCode = z.infer<typeof evidenceErrorCodeSchema>;

export const deadlineTypeValues = [
  "APPEAL",
  "REVIEW",
  "RESPONSE",
  "ESCALATION",
  "UNKNOWN",
] as const;

export const deadlineTypeSchema = z.enum(deadlineTypeValues);
export type DeadlineType = z.infer<typeof deadlineTypeSchema>;

export const deadlineTriggerTypeValues = [
  "DECISION_DATE",
  "NOTIFICATION_DATE",
  "RESPONSE_DATE",
  "USER_ENTERED",
  "UNKNOWN",
] as const;

export const deadlineTriggerTypeSchema = z.enum(deadlineTriggerTypeValues);
export type DeadlineTriggerType = z.infer<typeof deadlineTriggerTypeSchema>;

export const deadlineRelativeUnitValues = [
  "HOURS",
  "DAYS",
  "WEEKS",
  "MONTHS",
  "UNKNOWN",
] as const;

export const deadlineRelativeUnitSchema = z.enum(deadlineRelativeUnitValues);
export type DeadlineRelativeUnit = z.infer<typeof deadlineRelativeUnitSchema>;

export const deadlineStatusValues = [
  "OPEN",
  "COMPLETED",
  "EXPIRED",
  "CONFLICTED",
  "UNKNOWN",
] as const;

export const deadlineStatusSchema = z.enum(deadlineStatusValues);
export type DeadlineStatus = z.infer<typeof deadlineStatusSchema>;

export const responseOutcomeValues = [
  "APPROVED",
  "REJECTED",
  "MORE_INFO",
  "PARTIAL",
  "UNKNOWN",
] as const;
export const responseOutcomeSchema = z.enum(responseOutcomeValues);
export type ResponseOutcome = z.infer<typeof responseOutcomeSchema>;

export const responseAssociationStatusValues = [
  "ASSOCIATED",
  "UNRELATED",
  "AMBIGUOUS",
] as const;
export const responseAssociationStatusSchema = z.enum(
  responseAssociationStatusValues,
);
export type ResponseAssociationStatus = z.infer<
  typeof responseAssociationStatusSchema
>;

export const responseProcessingStatusValues = [
  "RECEIVED",
  "ANALYZING",
  "ANALYZED",
  "FAILED",
] as const;
export const responseProcessingStatusSchema = z.enum(
  responseProcessingStatusValues,
);
export type ResponseProcessingStatus = z.infer<
  typeof responseProcessingStatusSchema
>;

export const notificationChannelValues = ["IN_APP", "EMAIL"] as const;
export const notificationChannelSchema = z.enum(notificationChannelValues);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const businessDayRuleValues = [
  "CALENDAR_DAYS",
  "BUSINESS_DAYS",
  "UNKNOWN",
] as const;

export const businessDayRuleSchema = z.enum(businessDayRuleValues);
export type BusinessDayRule = z.infer<typeof businessDayRuleSchema>;

export const readinessFactorStatusValues = [
  "SATISFIED",
  "MISSING",
  "UNCERTAIN",
  "CONFLICTED",
] as const;

export const readinessFactorStatusSchema = z.enum(readinessFactorStatusValues);
export type ReadinessFactorStatus = z.infer<typeof readinessFactorStatusSchema>;

export const jurisdictionRefSchema = z.object({
  countryCode: z.string().trim().max(3).nullable(),
  regionCode: z.string().trim().max(20).nullable(),
  source: z.string().trim().max(100).nullable(),
});
export type JurisdictionRef = z.infer<typeof jurisdictionRefSchema>;

export const financialImpactSchema = z.object({
  amount: z.string().trim().max(50).nullable(),
  currency: z.string().trim().toUpperCase().length(3).nullable(),
});
export type FinancialImpact = z.infer<typeof financialImpactSchema>;

export const decisionFieldSnapshotSchema = z.object({
  institutionName: z.string().trim().max(200).nullable(),
  relationship: relationshipTypeSchema.nullable(),
  decisionType: decisionTypeSchema.nullable(),
  jurisdiction: jurisdictionRefSchema.nullable(),
  statedReason: z.string().max(10000).nullable(),
  decisionDate: z.coerce.date().nullable(),
  notificationDate: z.coerce.date().nullable(),
  financialImpact: financialImpactSchema.nullable(),
});
export type DecisionFieldSnapshot = z.infer<typeof decisionFieldSnapshotSchema>;

export const decisionCorrectionSchema = decisionFieldSnapshotSchema.partial();
export type DecisionCorrection = z.infer<typeof decisionCorrectionSchema>;

export const readinessFactorSchema = z.object({
  key: z.string().min(1).max(100),
  status: readinessFactorStatusSchema,
  scoreImpact: z.number().min(-100).max(100),
  reason: z.string().max(1000),
});
export type ReadinessFactor = z.infer<typeof readinessFactorSchema>;

export const queueNameValues = [
  "case-orchestration",
  "procedure-retrieval",
  "evidence-processing",
  "ai-operations",
  "notifications",
  "external-actions",
  "maintenance",
] as const;

export const queueNameSchema = z.enum(queueNameValues);
export type QueueName = z.infer<typeof queueNameSchema>;

export const queueRetryCategoryValues = [
  "TRANSIENT",
  "RATE_LIMITED",
  "INVALID_INPUT",
  "UNSUPPORTED",
  "PROVIDER_SCHEMA",
  "DELETED_RESOURCE",
  "CONSEQUENTIAL_ACTION",
  "UNKNOWN",
] as const;

export const queueRetryCategorySchema = z.enum(queueRetryCategoryValues);
export type QueueRetryCategory = z.infer<typeof queueRetryCategorySchema>;

export const queueJobPayloadSchema = z.object({
  correlationId: z.string().max(200).nullable(),
  idempotencyKey: z.string().min(1).max(200),
  workflowVersion: z.string().min(1).max(50),
});
export type QueueJobPayload = z.infer<typeof queueJobPayloadSchema>;

export const caseEventJobPayloadSchema = queueJobPayloadSchema.extend({
  dispatchId: z.string().min(1),
  eventId: z.string().min(1),
  caseId: z.string().min(1),
  eventSequence: z.number().int().positive(),
});
export type CaseEventJobPayload = z.infer<typeof caseEventJobPayloadSchema>;

export const evidenceProcessingJobPayloadSchema = queueJobPayloadSchema.extend({
  evidenceId: z.string().min(1),
  caseId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type EvidenceProcessingJobPayload = z.infer<
  typeof evidenceProcessingJobPayloadSchema
>;

export const maintenanceJobPayloadSchema = queueJobPayloadSchema.extend({
  requestedAt: z.coerce.date(),
});
export type MaintenanceJobPayload = z.infer<typeof maintenanceJobPayloadSchema>;

export const queueFailureMetadataSchema = z.object({
  queue: queueNameSchema,
  jobId: z.string().min(1),
  jobName: z.string().min(1),
  category: queueRetryCategorySchema,
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  attemptsMade: z.number().int().nonnegative(),
  caseId: z.string().nullable(),
  evidenceId: z.string().nullable(),
});
export type QueueFailureMetadata = z.infer<typeof queueFailureMetadataSchema>;

export const aiOperationNameValues = [
  "classify-case",
  "extract-document-claims",
  "extract-timeline-events",
  "extract-procedure",
  "verify-procedural-claim",
  "detect-claim-conflicts",
  "analyze-case",
  "analyze-response",
  "replan-case",
] as const;

export const aiOperationNameSchema = z.enum(aiOperationNameValues);
export type AIOperationName = z.infer<typeof aiOperationNameSchema>;

export const aiRunStatusValues = [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "REJECTED",
] as const;

export const aiRunStatusSchema = z.enum(aiRunStatusValues);
export type AIRunStatus = z.infer<typeof aiRunStatusSchema>;

export const aiOperationJobPayloadSchema = queueJobPayloadSchema.extend({
  operation: aiOperationNameSchema,
  caseId: z.string().min(1).nullable(),
  evidenceId: z.string().min(1).nullable(),
  responseId: z.string().min(1).nullable().optional(),
  expectedRevision: z.number().int().nonnegative().nullable(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type AIOperationJobPayload = z.infer<typeof aiOperationJobPayloadSchema>;

export const notificationJobKindValues = [
  "OUTBOUND_EMAIL",
  "DEADLINE_REMINDER",
] as const;
export const notificationJobKindSchema = z.enum(notificationJobKindValues);
export type NotificationJobKind = z.infer<typeof notificationJobKindSchema>;

export const notificationJobPayloadSchema = queueJobPayloadSchema.extend({
  kind: notificationJobKindSchema,
  notificationId: z.string().min(1).nullable(),
  outboundEmailId: z.string().min(1).nullable(),
  deadlineId: z.string().min(1).nullable(),
});
export type NotificationJobPayload = z.infer<
  typeof notificationJobPayloadSchema
>;

export const sourceAuthorityTierValues = [
  "TIER_1_OFFICIAL_INSTITUTION",
  "TIER_1_OFFICIAL_GOVERNMENT",
  "TIER_1_REGULATOR_ADR",
  "TIER_2_REPUTABLE_SECONDARY",
  "TIER_3_UNOFFICIAL",
  "UNKNOWN",
] as const;

export const sourceAuthorityTierSchema = z.enum(sourceAuthorityTierValues);
export type SourceAuthorityTier = z.infer<typeof sourceAuthorityTierSchema>;

export const retrievalOperationValues = [
  "SEARCH",
  "EXTRACT",
  "MAP",
  "CRAWL",
  "USAGE",
] as const;
export const retrievalOperationSchema = z.enum(retrievalOperationValues);
export type RetrievalOperation = z.infer<typeof retrievalOperationSchema>;

export const retrievalRunStatusValues = [
  "RUNNING",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
] as const;
export const retrievalRunStatusSchema = z.enum(retrievalRunStatusValues);
export type RetrievalRunStatus = z.infer<typeof retrievalRunStatusSchema>;

export const procedureStatusValues = [
  "ACTIVE",
  "CONFLICTED",
  "UNRESOLVED",
  "STALE",
  "ARCHIVED",
] as const;
export const procedureStatusSchema = z.enum(procedureStatusValues);
export type ProcedureStatus = z.infer<typeof procedureStatusSchema>;

export const proceduralClaimTypeValues = [
  "ELIGIBILITY",
  "ROUTE",
  "DEADLINE",
  "REQUIREMENT",
  "STEP",
  "ESCALATION",
  "CONTACT",
  "OTHER",
] as const;
export const proceduralClaimTypeSchema = z.enum(proceduralClaimTypeValues);
export type ProceduralClaimType = z.infer<typeof proceduralClaimTypeSchema>;

export const proceduralClaimVerificationStatusValues = [
  "SUPPORTED",
  "CONTRADICTED",
  "AMBIGUOUS",
  "NOT_FOUND",
  "UNVERIFIED",
] as const;
export const proceduralClaimVerificationStatusSchema = z.enum(
  proceduralClaimVerificationStatusValues,
);
export type ProceduralClaimVerificationStatus = z.infer<
  typeof proceduralClaimVerificationStatusSchema
>;

export const sourceSnapshotStatusValues = [
  "RETRIEVED",
  "FAILED",
  "UNAVAILABLE",
] as const;
export const sourceSnapshotStatusSchema = z.enum(sourceSnapshotStatusValues);
export type SourceSnapshotStatus = z.infer<typeof sourceSnapshotStatusSchema>;

export const procedureScopeSchema = z.object({
  institutionId: z.string().min(1).nullable(),
  institutionName: z.string().trim().max(200).nullable(),
  relationship: relationshipTypeSchema.nullable(),
  decisionType: decisionTypeSchema.nullable(),
  jurisdictionKey: z.string().trim().max(100).nullable(),
});
export type ProcedureScope = z.infer<typeof procedureScopeSchema>;

export const procedureRetrievalJobPayloadSchema = queueJobPayloadSchema.extend({
  caseId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  classificationHash: z.string().regex(/^[a-f0-9]{64}$/),
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ProcedureRetrievalJobPayload = z.infer<
  typeof procedureRetrievalJobPayloadSchema
>;
