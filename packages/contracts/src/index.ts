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
  "CASE_REPLANNING",
  "CASE_RESOLVED",
  "CASE_EXHAUSTED",
  "CASE_NEEDS_HUMAN",
] as const;

export const caseEventTypeSchema = z.enum(caseEventTypeValues);
export type CaseEventType = z.infer<typeof caseEventTypeSchema>;

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
  "UNKNOWN",
] as const;

export const deadlineStatusSchema = z.enum(deadlineStatusValues);
export type DeadlineStatus = z.infer<typeof deadlineStatusSchema>;

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
