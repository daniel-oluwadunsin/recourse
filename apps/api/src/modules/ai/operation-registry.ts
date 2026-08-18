import { type z } from "zod";

import { type AIModelPurpose } from "./ai.types";
import {
  classifyCaseInputSchema,
  classifyCaseOutputSchema,
  extractDocumentClaimsInputSchema,
  extractDocumentClaimsOutputSchema,
  extractTimelineEventsInputSchema,
  extractTimelineEventsOutputSchema,
  extractProcedureInputSchema,
  extractProcedureOutputSchema,
  verifyProceduralClaimInputSchema,
  verifyProceduralClaimOutputSchema,
  claimConflictInputSchema,
  claimConflictOutputSchema,
  caseAnalysisInputSchema,
  caseAnalysisOutputSchema,
} from "./operation-schemas";
import { classifyCasePrompt } from "./prompts/classify-case.v1";
import { extractDocumentClaimsPrompt } from "./prompts/extract-document-claims.v1";
import { extractTimelineEventsPrompt } from "./prompts/extract-timeline-events.v1";
import { extractProcedurePrompt } from "./prompts/extract-procedure.v1";
import { verifyProceduralClaimPrompt } from "./prompts/verify-procedural-claim.v1";
import { detectClaimConflictsPrompt } from "./prompts/detect-claim-conflicts.v1";
import { analyzeCasePrompt } from "./prompts/analyze-case.v1";

export interface AIOperationDefinition<
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
> {
  name: string;
  modelPurpose: AIModelPurpose;
  promptVersion: string;
  schemaVersion: string;
  schemaName: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  maxCompletionTokens: number;
  buildPromptInput: (input: z.output<TInput>) => string;
}

export const aiOperationRegistry = {
  "classify-case": {
    name: "classify-case",
    modelPurpose: "FAST",
    promptVersion: classifyCasePrompt.promptVersion,
    schemaVersion: classifyCasePrompt.schemaVersion,
    schemaName: "classify_case_v1",
    inputSchema: classifyCaseInputSchema,
    outputSchema: classifyCaseOutputSchema,
    maxCompletionTokens: 1_500,
    buildPromptInput: (input) => JSON.stringify(input),
  },
  "extract-document-claims": {
    name: "extract-document-claims",
    modelPurpose: "FAST",
    promptVersion: extractDocumentClaimsPrompt.promptVersion,
    schemaVersion: extractDocumentClaimsPrompt.schemaVersion,
    schemaName: "extract_document_claims_v1",
    inputSchema: extractDocumentClaimsInputSchema,
    outputSchema: extractDocumentClaimsOutputSchema,
    maxCompletionTokens: 4_000,
    buildPromptInput: (input) => JSON.stringify(input),
  },
  "extract-timeline-events": {
    name: "extract-timeline-events",
    modelPurpose: "FAST",
    promptVersion: extractTimelineEventsPrompt.promptVersion,
    schemaVersion: extractTimelineEventsPrompt.schemaVersion,
    schemaName: "extract_timeline_events_v1",
    inputSchema: extractTimelineEventsInputSchema,
    outputSchema: extractTimelineEventsOutputSchema,
    maxCompletionTokens: 4_000,
    buildPromptInput: (input) => JSON.stringify(input),
  },
  "extract-procedure": {
    name: "extract-procedure",
    modelPurpose: "FAST",
    promptVersion: extractProcedurePrompt.promptVersion,
    schemaVersion: extractProcedurePrompt.schemaVersion,
    schemaName: "extract_procedure_v1",
    inputSchema: extractProcedureInputSchema,
    outputSchema: extractProcedureOutputSchema,
    maxCompletionTokens: 6000,
    buildPromptInput: (input) => JSON.stringify(input),
  },
  "verify-procedural-claim": {
    name: "verify-procedural-claim",
    modelPurpose: "REASONING",
    promptVersion: verifyProceduralClaimPrompt.promptVersion,
    schemaVersion: verifyProceduralClaimPrompt.schemaVersion,
    schemaName: "verify_procedural_claim_v1",
    inputSchema: verifyProceduralClaimInputSchema,
    outputSchema: verifyProceduralClaimOutputSchema,
    maxCompletionTokens: 2500,
    buildPromptInput: (input) => JSON.stringify(input),
  },
  "detect-claim-conflicts": {
    name: "detect-claim-conflicts",
    modelPurpose: "REASONING",
    promptVersion: detectClaimConflictsPrompt.promptVersion,
    schemaVersion: detectClaimConflictsPrompt.schemaVersion,
    schemaName: "detect_claim_conflicts_v1",
    inputSchema: claimConflictInputSchema,
    outputSchema: claimConflictOutputSchema,
    maxCompletionTokens: 1500,
    buildPromptInput: (input) => JSON.stringify(input),
  },
  "analyze-case": {
    name: "analyze-case",
    modelPurpose: "REASONING",
    promptVersion: analyzeCasePrompt.promptVersion,
    schemaVersion: analyzeCasePrompt.schemaVersion,
    schemaName: "analyze_case_v1",
    inputSchema: caseAnalysisInputSchema,
    outputSchema: caseAnalysisOutputSchema,
    maxCompletionTokens: 3500,
    buildPromptInput: (input) => JSON.stringify(input),
  },
} satisfies Record<string, AIOperationDefinition<z.ZodType, z.ZodType>>;

export type RegisteredAIOperation = keyof typeof aiOperationRegistry;

export function getAIOperationDefinition(
  name: RegisteredAIOperation,
): (typeof aiOperationRegistry)[RegisteredAIOperation] {
  return aiOperationRegistry[name];
}
