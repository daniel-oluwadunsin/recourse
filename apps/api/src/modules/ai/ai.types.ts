import { type z } from "zod";

export type AIModelPurpose = "FAST" | "REASONING" | "VISION";

export interface AITextContentPart {
  type: "text";
  text: string;
}

export interface AIImageContentPart {
  type: "image_url";
  image_url: { url: string };
}

export type AIMessageContent =
  string | readonly (AITextContentPart | AIImageContentPart)[];

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: AIMessageContent;
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StructuredGenerationRequest<T> {
  model: string;
  schemaName: string;
  schema: z.ZodType<T>;
  messages: readonly AIMessage[];
  maxCompletionTokens: number;
  reasoningEffort: "none" | "low" | "medium" | "high";
}

export interface StructuredGenerationResult<T> {
  output: T;
  model: string;
  providerRequestId: string | null;
  usage: AIUsage;
  latencyMs: number;
  structuredMode: "strict" | "json_object";
}

export interface GenerativeAIProvider {
  completeStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>>;
  completeMultimodalStructured<T>(
    request: StructuredGenerationRequest<T> & { imageUrl: string },
  ): Promise<StructuredGenerationResult<T>>;
  healthCheck(): Promise<{ configured: boolean; modelIds: string[] }>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly statusCode: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
