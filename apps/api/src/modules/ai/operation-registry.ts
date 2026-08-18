import { type z } from "zod";

import { type AIModelPurpose } from "./ai.types";
import {
  classifyCaseInputSchema,
  classifyCaseOutputSchema,
  extractDocumentClaimsInputSchema,
  extractDocumentClaimsOutputSchema,
  extractTimelineEventsInputSchema,
  extractTimelineEventsOutputSchema,
} from "./operation-schemas";
import { classifyCasePrompt } from "./prompts/classify-case.v1";
import { extractDocumentClaimsPrompt } from "./prompts/extract-document-claims.v1";
import { extractTimelineEventsPrompt } from "./prompts/extract-timeline-events.v1";

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
} satisfies Record<string, AIOperationDefinition<z.ZodType, z.ZodType>>;

export type RegisteredAIOperation = keyof typeof aiOperationRegistry;

export function getAIOperationDefinition(
  name: RegisteredAIOperation,
): (typeof aiOperationRegistry)[RegisteredAIOperation] {
  return aiOperationRegistry[name];
}
