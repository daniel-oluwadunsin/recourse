import { z } from "zod";

import {
  claimEvidenceStatusSchema,
  controlledActionTypeSchema,
  decisionTypeSchema,
  proceduralClaimTypeSchema,
  proceduralClaimVerificationStatusSchema,
  relationshipTypeSchema,
  responseOutcomeSchema,
  sourceAuthorityTierSchema,
} from "@recourse/contracts";

const boundedText = z.string().trim().max(20_000);
const nullableDateText = z.string().trim().max(100).nullable();

export const classifyCaseInputSchema = z.object({
  caseId: z.string().min(1),
  institutionName: boundedText.nullable(),
  relationship: relationshipTypeSchema.nullable(),
  decisionType: decisionTypeSchema.nullable(),
  statedReason: boundedText.nullable(),
  decisionDate: nullableDateText,
  notificationDate: nullableDateText,
  jurisdiction: z
    .object({
      countryCode: z.string().max(3).nullable(),
      regionCode: z.string().max(20).nullable(),
      source: z.string().max(100).nullable(),
    })
    .nullable(),
  evidenceRefs: z.array(z.string().min(1).max(200)).max(100),
});
export type ClassifyCaseInput = z.infer<typeof classifyCaseInputSchema>;

export const classifyCaseOutputSchema = z.object({
  relationship: relationshipTypeSchema,
  decisionType: decisionTypeSchema,
  institutionName: boundedText.nullable(),
  confidence: z.number().min(0).max(1),
  needsHumanReview: z.boolean(),
  rationale: z.string().max(2_000),
  sourceRefs: z.array(z.string().min(1).max(200)).max(100),
});
export type ClassifyCaseOutput = z.infer<typeof classifyCaseOutputSchema>;

export const evidenceBlockInputSchema = z.object({
  blockId: z.string().min(1),
  pageNumber: z.number().int().positive().nullable(),
  text: boundedText,
});
export type EvidenceBlockInput = z.infer<typeof evidenceBlockInputSchema>;

export const extractDocumentClaimsInputSchema = z.object({
  caseId: z.string().min(1),
  evidenceId: z.string().min(1),
  nativeBlocks: z.array(evidenceBlockInputSchema).max(500),
  imageUrl: z.string().url().nullable(),
});
export type ExtractDocumentClaimsInput = z.infer<
  typeof extractDocumentClaimsInputSchema
>;

export const documentClaimSchema = z.object({
  claimText: boundedText,
  normalizedFact: boundedText.nullable(),
  evidenceStatus: claimEvidenceStatusSchema,
  evidenceBlockIds: z.array(z.string().min(1).max(200)).min(1).max(50),
  confidence: z.number().min(0).max(1),
});

export const extractDocumentClaimsOutputSchema = z.object({
  claims: z.array(documentClaimSchema).max(200),
  needsHumanReview: z.boolean(),
});
export type ExtractDocumentClaimsOutput = z.infer<
  typeof extractDocumentClaimsOutputSchema
>;

export const extractTimelineEventsInputSchema = z.object({
  caseId: z.string().min(1),
  evidenceRefs: z.array(evidenceBlockInputSchema).max(500),
});
export type ExtractTimelineEventsInput = z.infer<
  typeof extractTimelineEventsInputSchema
>;

export const timelineDatePrecisionSchema = z.enum([
  "EXACT",
  "APPROXIMATE",
  "UNKNOWN",
]);

export const timelineEventSchema = z.object({
  eventText: boundedText,
  date: nullableDateText,
  datePrecision: timelineDatePrecisionSchema,
  evidenceBlockIds: z.array(z.string().min(1).max(200)).min(1).max(50),
  confidence: z.number().min(0).max(1),
});

export const extractTimelineEventsOutputSchema = z.object({
  events: z.array(timelineEventSchema).max(200),
  needsHumanReview: z.boolean(),
});
export type ExtractTimelineEventsOutput = z.infer<
  typeof extractTimelineEventsOutputSchema
>;

const sourceParagraphInputSchema = z.object({
  paragraphId: z.string().min(1).max(200),
  text: boundedText,
});

export const procedureSourceInputSchema = z.object({
  sourceSnapshotId: z.string().min(1).max(100),
  canonicalUrl: z.string().url(),
  authorityTier: sourceAuthorityTierSchema,
  paragraphs: z.array(sourceParagraphInputSchema).min(1).max(100),
});

export const extractProcedureInputSchema = z.object({
  caseId: z.string().min(1),
  institutionName: boundedText.nullable(),
  relationship: relationshipTypeSchema,
  decisionType: decisionTypeSchema,
  jurisdictionKey: z.string().max(100).nullable(),
  sources: z.array(procedureSourceInputSchema).min(1).max(20),
});
export type ExtractProcedureInput = z.infer<typeof extractProcedureInputSchema>;

const procedureClaimOutputSchema = z.object({
  claimKey: z.string().trim().min(1).max(100),
  type: proceduralClaimTypeSchema,
  humanText: boundedText,
  normalizedValue: boundedText.nullable(),
  sourceSnapshotId: z.string().min(1).max(100),
  paragraphIds: z.array(z.string().min(1).max(200)).min(1).max(20),
  confidence: z.number().min(0).max(1),
});

const procedureStepOutputSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  description: boundedText,
  paragraphIds: z.array(z.string().min(1).max(200)).min(1).max(20),
});

const procedureDeadlineOutputSchema = z.object({
  type: z.string().trim().min(1).max(100),
  dueText: boundedText.nullable(),
  relativeDays: z.number().int().min(0).nullable(),
  paragraphIds: z.array(z.string().min(1).max(200)).min(1).max(20),
});

export const extractProcedureOutputSchema = z.object({
  claims: z.array(procedureClaimOutputSchema).max(100),
  steps: z.array(procedureStepOutputSchema).max(50),
  deadlines: z.array(procedureDeadlineOutputSchema).max(20),
  evidenceRequirements: z.array(boundedText).max(50),
  escalationRoutes: z.array(boundedText).max(20),
  submissionCapability: z.enum([
    "AUTO_API",
    "EMAIL",
    "ASSISTED_PORTAL",
    "MANUAL",
    "UNSUPPORTED",
  ]),
  needsHumanReview: z.boolean(),
});
export type ExtractProcedureOutput = z.infer<
  typeof extractProcedureOutputSchema
>;

export const verifyProceduralClaimInputSchema = z.object({
  caseId: z.string().min(1),
  claimText: boundedText,
  claimType: proceduralClaimTypeSchema,
  sources: z.array(procedureSourceInputSchema).min(1).max(20),
});
export type VerifyProceduralClaimInput = z.infer<
  typeof verifyProceduralClaimInputSchema
>;

export const verifyProceduralClaimOutputSchema = z.object({
  verificationStatus: proceduralClaimVerificationStatusSchema,
  supportingSourceSnapshotId: z.string().min(1).max(100).nullable(),
  supportingParagraphIds: z.array(z.string().min(1).max(200)).max(20),
  explanation: z.string().max(2000),
  confidence: z.number().min(0).max(1),
});
export type VerifyProceduralClaimOutput = z.infer<
  typeof verifyProceduralClaimOutputSchema
>;

export const claimConflictInputSchema = z.object({
  caseId: z.string().min(1),
  claimA: z.object({
    claimId: z.string().min(1),
    text: boundedText,
    normalizedType: boundedText.nullable(),
    normalizedValue: boundedText.nullable(),
    status: claimEvidenceStatusSchema,
    sourceRefs: z.array(z.string().min(1).max(200)).max(20),
  }),
  claimB: z.object({
    claimId: z.string().min(1),
    text: boundedText,
    normalizedType: boundedText.nullable(),
    normalizedValue: boundedText.nullable(),
    status: claimEvidenceStatusSchema,
    sourceRefs: z.array(z.string().min(1).max(200)).max(20),
  }),
});
export type ClaimConflictInput = z.infer<typeof claimConflictInputSchema>;

export const claimConflictOutputSchema = z.object({
  status: z.enum(["RESOLVED", "EXPLAINABLE", "UNKNOWN", "OPEN"]),
  explanation: z.string().max(2000),
  confidence: z.number().min(0).max(1),
});
export type ClaimConflictOutput = z.infer<typeof claimConflictOutputSchema>;

export const caseAnalysisInputSchema = z.object({
  caseId: z.string().min(1),
  claims: z
    .array(
      z.object({
        claimId: z.string().min(1),
        text: boundedText,
        status: claimEvidenceStatusSchema,
        sourceRefs: z.array(z.string().min(1).max(200)).max(20),
      }),
    )
    .max(250),
  timeline: z
    .array(
      z.object({
        eventId: z.string().min(1),
        text: boundedText,
        date: nullableDateText,
      }),
    )
    .max(250),
  contradictions: z
    .array(
      z.object({
        contradictionId: z.string().min(1),
        explanation: z.string().max(2000),
        status: z.enum(["OPEN", "RESOLVED", "EXPLAINABLE", "UNKNOWN"]),
      }),
    )
    .max(100),
  requirements: z
    .array(
      z.object({
        requirementKey: z.string().min(1).max(100),
        text: boundedText,
        status: z.enum([
          "SATISFIED",
          "PARTIAL",
          "MISSING",
          "NOT_APPLICABLE",
          "UNCERTAIN",
        ]),
      }),
    )
    .max(100),
});
export type CaseAnalysisInput = z.infer<typeof caseAnalysisInputSchema>;

export const caseAnalysisOutputSchema = z.object({
  centralIssues: z.array(boundedText).max(20),
  unresolvedFacts: z.array(boundedText).max(50),
  supportedClaimIds: z.array(z.string().min(1).max(200)).max(250),
  recommendedNextSteps: z.array(boundedText).max(20),
  needsHumanReview: z.boolean(),
});
export type CaseAnalysisOutput = z.infer<typeof caseAnalysisOutputSchema>;

export const analyzeResponseInputSchema = z.object({
  caseId: z.string().min(1),
  responseId: z.string().min(1),
  subject: boundedText.nullable(),
  sender: z.string().max(320),
  responseText: boundedText,
  claims: z
    .array(
      z.object({
        claimId: z.string().min(1),
        text: boundedText,
        status: claimEvidenceStatusSchema,
      }),
    )
    .max(100),
  verifiedProceduralClaimIds: z.array(z.string().min(1)).max(100),
});
export type AnalyzeResponseInput = z.infer<typeof analyzeResponseInputSchema>;

export const responseNewIssueSchema = z.object({
  text: boundedText,
  evidenceRequested: z.boolean(),
});

export const analyzeResponseOutputSchema = z.object({
  outcome: responseOutcomeSchema,
  outcomeConfidence: z.number().min(0).max(1),
  statedReason: boundedText.nullable(),
  addressedClaimIds: z.array(z.string().min(1)).max(100),
  unaddressedClaimIds: z.array(z.string().min(1)).max(100),
  newIssues: z.array(responseNewIssueSchema).max(50),
  requestedEvidence: z.array(boundedText).max(50),
  mentionedDeadlines: z.array(boundedText).max(20),
  needsHumanReview: z.boolean(),
});
export type AnalyzeResponseOutput = z.infer<typeof analyzeResponseOutputSchema>;

export const replanCaseInputSchema = z.object({
  caseId: z.string().min(1),
  responseId: z.string().min(1),
  outcome: responseOutcomeSchema,
  outcomeConfidence: z.number().min(0).max(1),
  statedReason: boundedText.nullable(),
  requestedEvidence: z.array(boundedText).max(50),
  newIssues: z.array(responseNewIssueSchema).max(50),
  openCriticalGapCount: z.number().int().nonnegative(),
  unresolvedContradictionCount: z.number().int().nonnegative(),
  procedureVerified: z.boolean(),
  procedureCapabilities: z.array(z.string().max(50)).max(10),
  supportingClaimIds: z.array(z.string().min(1)).max(100),
  supportingProceduralClaimIds: z.array(z.string().min(1)).max(100),
});
export type ReplanCaseInput = z.infer<typeof replanCaseInputSchema>;

export const replanCaseOutputSchema = z.object({
  nextAction: controlledActionTypeSchema,
  rationale: boundedText,
  supportingClaimIds: z.array(z.string().min(1)).max(100),
  supportingProceduralClaimIds: z.array(z.string().min(1)).max(100),
  confidence: z.number().min(0).max(1),
  needsHumanReview: z.boolean(),
});
export type ReplanCaseOutput = z.infer<typeof replanCaseOutputSchema>;
