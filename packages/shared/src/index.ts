import { z } from 'zod';

export const caseStatuses = [
  'NEW',
  'ANALYZING',
  'NEEDS_INFO',
  'BUILDING_CASE',
  'NEEDS_EVIDENCE',
  'READY',
  'AWAITING_SUBMISSION',
  'AWAITING_RESPONSE',
  'CONTINUING',
  'RESOLVED',
  'CLOSED',
] as const;
export const CaseStatusSchema = z.enum(caseStatuses);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const factSources = [
  'VERIFIED_DOCUMENT',
  'VERIFIED_EXTERNAL',
  'USER_ASSERTED',
  'INFERRED',
  'CONTRADICTED',
  'UNKNOWN',
] as const;
export const FactSourceSchema = z.enum(factSources);
export type FactSource = z.infer<typeof FactSourceSchema>;

export const documentPurposes = [
  'decision',
  'evidence',
  'actual_submission',
  'response',
] as const;
export const DocumentPurposeSchema = z.enum(documentPurposes);
export type DocumentPurpose = z.infer<typeof DocumentPurposeSchema>;

export const CriticalUnknownSchema = z.object({
  field: z.string().min(1),
  questionForUser: z.string().min(1),
});

export const CaseUnderstandingSchema = z.object({
  institution: z.string().nullable(),
  decision: z.string().min(1),
  statedReason: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  decisionDate: z.string().nullable(),
  jurisdiction: z.string().nullable(),
  amountAffected: z.number().nullable(),
  currency: z.string().nullable(),
  summary: z.string().min(1),
  desiredOutcome: z.string().nullable(),
  criticalUnknowns: z.array(CriticalUnknownSchema).max(5),
  highStakes: z.boolean(),
  highStakesReason: z.string().nullable(),
});
export type CaseUnderstanding = z.infer<typeof CaseUnderstandingSchema>;

export const ProcedureSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  domain: z.string(),
  excerpt: z.string(),
  authority: z.enum(['official', 'regulator', 'trusted_guidance', 'other']),
  accessedAt: z.string(),
});

export const ProcedureSchema = z.object({
  status: z.enum([
    'PENDING',
    'RUNNING',
    'VERIFIED',
    'NOT_FOUND',
    'UNVERIFIED',
    'ERROR',
  ]),
  summary: z.string(),
  procedureAvailable: z.boolean(),
  deadline: z.string().nullable(),
  steps: z.array(z.string()).max(10),
  evidenceGuidance: z.array(z.string()).max(10),
  nextRoute: z.string().nullable(),
  sourceIds: z.array(z.string()).max(5),
  uncertainty: z.string().nullable(),
});
export type Procedure = z.infer<typeof ProcedureSchema>;

export const ExtractedFactSchema = z.object({
  statement: z.string(),
  source: FactSourceSchema,
  date: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const EvidenceExtractionSchema = z.object({
  summary: z.string(),
  language: z.string().nullable(),
  readable: z.boolean(),
  unreadableReason: z.string().nullable(),
  facts: z.array(ExtractedFactSchema).max(20),
});
export type EvidenceExtraction = z.infer<typeof EvidenceExtractionSchema>;

export const CaseAnalysisSchema = z.object({
  summary: z.string(),
  usefulEvidence: z
    .array(
      z.object({
        documentId: z.string(),
        title: z.string(),
        explanation: z.string(),
      }),
    )
    .max(12),
  missingEvidence: z
    .array(
      z.object({
        name: z.string(),
        whyItMatters: z.string(),
        isOfficiallyRequired: z.boolean().nullable(),
      }),
    )
    .max(10),
  contradictions: z
    .array(
      z.object({
        description: z.string(),
        documentIds: z.array(z.string()),
        needsUserClarification: z.boolean(),
        questionForUser: z.string().nullable(),
      }),
    )
    .max(10),
  timeline: z
    .array(z.object({ date: z.string().nullable(), event: z.string() }))
    .max(20),
  readiness: z.enum(['needs_info', 'needs_evidence', 'ready']),
  recommendation: z.string(),
});
export type CaseAnalysis = z.infer<typeof CaseAnalysisSchema>;

export const ChatAnswerSchema = z.object({
  answer: z.string(),
  caseRelated: z.boolean(),
  needsFact: z.boolean(),
  followUpQuestion: z.string().nullable(),
  referencedDocumentIds: z.array(z.string()).max(8),
  referencedSourceIds: z.array(z.string()).max(8),
  factsToRecord: z
    .array(z.object({ field: z.string(), value: z.string() }))
    .max(5),
});
export type ChatAnswer = z.infer<typeof ChatAnswerSchema>;

export const EmailDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  suggestedAttachments: z
    .array(
      z.object({
        documentId: z.string(),
        reason: z.string(),
      }),
    )
    .max(12),
  unresolvedFacts: z.array(z.string()).max(10),
});
export type EmailDraft = z.infer<typeof EmailDraftSchema>;

export const FormalLetterSchema = z.object({
  sender: z.string(),
  recipient: z.string(),
  date: z.string(),
  reference: z.string().nullable(),
  subject: z.string(),
  salutation: z.string(),
  paragraphs: z.array(z.string()).min(2).max(15),
  closing: z.string(),
  signatory: z.string(),
  suggestedAttachments: z.array(z.string()).max(12),
  unresolvedFacts: z.array(z.string()).max(10),
});
export type FormalLetter = z.infer<typeof FormalLetterSchema>;

export const ResponseAnalysisSchema = z.object({
  outcome: z.enum([
    'accepted',
    'partially_accepted',
    'rejected',
    'more_information_requested',
    'unclear',
  ]),
  responseSummary: z.string(),
  reasonGiven: z.string().nullable(),
  changedReasoning: z.string().nullable(),
  pointsAddressed: z.array(z.string()).max(15),
  pointsNotAddressed: z.array(z.string()).max(15),
  newRequests: z.array(z.string()).max(15),
  anotherRouteLikely: z.boolean(),
  recommendation: z.string(),
});
export type ResponseAnalysis = z.infer<typeof ResponseAnalysisSchema>;

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const statusLabels: Record<CaseStatus, string> = {
  NEW: 'New case',
  ANALYZING: 'Understanding what happened',
  NEEDS_INFO: 'Needs information',
  BUILDING_CASE: 'Building your case',
  NEEDS_EVIDENCE: 'Needs evidence',
  READY: 'Ready',
  AWAITING_SUBMISSION: 'Ready for your action',
  AWAITING_RESPONSE: 'Waiting for a response',
  CONTINUING: 'Reviewing the response',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};
