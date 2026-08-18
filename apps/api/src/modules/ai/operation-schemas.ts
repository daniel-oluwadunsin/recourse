import { z } from "zod";

import {
  claimEvidenceStatusSchema,
  decisionTypeSchema,
  relationshipTypeSchema,
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
