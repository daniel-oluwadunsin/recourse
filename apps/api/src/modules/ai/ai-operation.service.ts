import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";

import { type AIRunDocument } from "./schemas/ai-run.schema";
import { AIRunService } from "./ai-run.service";
import { AIModelRouterService } from "./model-router.service";
import { AIProviderError } from "./ai.types";
import {
  type ClassifyCaseInput,
  classifyCaseInputSchema,
  classifyCaseOutputSchema,
  type ClassifyCaseOutput,
  type ExtractDocumentClaimsInput,
  extractDocumentClaimsInputSchema,
  extractDocumentClaimsOutputSchema,
  type ExtractDocumentClaimsOutput,
  type ExtractTimelineEventsInput,
  extractTimelineEventsInputSchema,
  extractTimelineEventsOutputSchema,
  type ExtractTimelineEventsOutput,
} from "./operation-schemas";
import { GroqProvider } from "./groq.provider";
import { aiOperationRegistry } from "./operation-registry";
import { classifyCasePrompt } from "./prompts/classify-case.v1";
import { extractDocumentClaimsPrompt } from "./prompts/extract-document-claims.v1";
import { extractTimelineEventsPrompt } from "./prompts/extract-timeline-events.v1";

export interface AIOperationResult<T> {
  output: T;
  run: AIRunDocument;
}

@Injectable()
export class AIOperationService {
  constructor(
    private readonly provider: GroqProvider,
    private readonly router: AIModelRouterService,
    private readonly runs: AIRunService,
  ) {}

  async classifyCase(
    input: ClassifyCaseInput,
  ): Promise<AIOperationResult<ClassifyCaseOutput>> {
    const parsed = classifyCaseInputSchema.parse(input);
    const definition = aiOperationRegistry["classify-case"];
    return this.execute(
      definition,
      parsed,
      [parsed.caseId, ...parsed.evidenceRefs],
      classifyCasePrompt.buildMessages(JSON.stringify(parsed)),
      classifyCaseOutputSchema,
      null,
      (output) => {
        assertRefsAreSubset(output.sourceRefs, parsed.evidenceRefs);
      },
    );
  }

  async extractDocumentClaims(
    input: ExtractDocumentClaimsInput,
  ): Promise<AIOperationResult<ExtractDocumentClaimsOutput>> {
    const parsed = extractDocumentClaimsInputSchema.parse(input);
    const definition = aiOperationRegistry["extract-document-claims"];
    const messages = extractDocumentClaimsPrompt.buildMessages(
      JSON.stringify({
        caseId: parsed.caseId,
        evidenceId: parsed.evidenceId,
        blocks: parsed.nativeBlocks,
      }),
    );
    const hasUsefulNativeText = parsed.nativeBlocks.some(
      (block) => block.text.trim().length >= 20,
    );
    return this.execute(
      definition,
      parsed,
      [
        parsed.caseId,
        parsed.evidenceId,
        ...parsed.nativeBlocks.map((block) => block.blockId),
      ],
      messages,
      extractDocumentClaimsOutputSchema,
      hasUsefulNativeText ? null : parsed.imageUrl,
      (output) => {
        const allowed = new Set(
          parsed.nativeBlocks.map((block) => block.blockId),
        );
        for (const claim of output.claims) {
          assertRefsAreSubset(claim.evidenceBlockIds, allowed);
        }
      },
    );
  }

  async extractTimelineEvents(
    input: ExtractTimelineEventsInput,
  ): Promise<AIOperationResult<ExtractTimelineEventsOutput>> {
    const parsed = extractTimelineEventsInputSchema.parse(input);
    const definition = aiOperationRegistry["extract-timeline-events"];
    return this.execute(
      definition,
      parsed,
      [parsed.caseId, ...parsed.evidenceRefs.map((block) => block.blockId)],
      extractTimelineEventsPrompt.buildMessages(JSON.stringify(parsed)),
      extractTimelineEventsOutputSchema,
      null,
      (output) => {
        const allowed = new Set(
          parsed.evidenceRefs.map((block) => block.blockId),
        );
        for (const event of output.events) {
          assertRefsAreSubset(event.evidenceBlockIds, allowed);
        }
      },
    );
  }

  private async execute<TInput extends z.ZodType, TOutput>(
    definition: {
      name: string;
      modelPurpose: "FAST" | "REASONING" | "VISION";
      promptVersion: string;
      schemaVersion: string;
      schemaName: string;
      outputSchema: z.ZodType<TOutput>;
      maxCompletionTokens: number;
    },
    input: z.output<TInput>,
    inputRefs: string[],
    messages: ReturnType<typeof classifyCasePrompt.buildMessages>,
    outputSchema: z.ZodType<TOutput>,
    imageUrl: string | null = null,
    semanticValidate: (output: TOutput) => void = () => undefined,
  ): Promise<AIOperationResult<TOutput>> {
    const inputHash = hashInput(
      imageUrl && isRecord(input) ? { ...input, imageUrl: null } : input,
    );
    const reasoningEffort = imageUrl ? "none" : this.router.reasoningEffort();
    const model = this.router.modelFor(
      imageUrl ? "VISION" : definition.modelPurpose,
    );
    const run = await this.runs.start({
      caseId: inputRefs[0] ?? null,
      evidenceId: inputRefs[1] ?? null,
      inputHashes: [inputHash],
      inputRefs,
      model,
      operation: definition.name,
      promptVersion: definition.promptVersion,
      reasoningEffort,
      schemaVersion: definition.schemaVersion,
    });

    try {
      const result = imageUrl
        ? await this.provider.completeMultimodalStructured({
            imageUrl,
            maxCompletionTokens: definition.maxCompletionTokens,
            messages,
            model,
            reasoningEffort: "none",
            schema: outputSchema,
            schemaName: definition.schemaName,
          })
        : await this.provider.completeStructured({
            maxCompletionTokens: definition.maxCompletionTokens,
            messages,
            model,
            reasoningEffort,
            schema: outputSchema,
            schemaName: definition.schemaName,
          });
      semanticValidate(result.output);
      await this.runs.succeed(run, {
        latencyMs: result.latencyMs,
        output: asRecord(result.output),
        providerRequestId: result.providerRequestId,
        usage: result.usage,
      });
      return { output: outputSchema.parse(result.output), run };
    } catch (error: unknown) {
      await this.runs.fail(run, error);
      throw error;
    }
  }
}

export function hashInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRefsAreSubset(
  refs: readonly string[],
  allowed: Iterable<string>,
): void {
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
  if (refs.some((ref) => !allowedSet.has(ref))) {
    throw new AIProviderError(
      "AI output referenced a source outside the supplied input.",
      "OUTPUT_PROVENANCE_INVALID",
      false,
    );
  }
}
