import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { z } from "zod";

import { type AIRunDocument } from "./schemas/ai-run.schema";
import { AIRunService } from "./ai-run.service";
import { type EnvironmentConfig } from "@recourse/config";
import { ApplicationObservabilityService } from "../../common/observability.service";
import { UsageBudgetService } from "../../common/security/usage-budget.service";
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
  type ExtractProcedureInput,
  extractProcedureInputSchema,
  extractProcedureOutputSchema,
  type ExtractProcedureOutput,
  type VerifyProceduralClaimInput,
  verifyProceduralClaimInputSchema,
  verifyProceduralClaimOutputSchema,
  type VerifyProceduralClaimOutput,
  type ClaimConflictInput,
  claimConflictInputSchema,
  claimConflictOutputSchema,
  type ClaimConflictOutput,
  type CaseAnalysisInput,
  caseAnalysisInputSchema,
  caseAnalysisOutputSchema,
  type CaseAnalysisOutput,
  type AnalyzeResponseInput,
  analyzeResponseInputSchema,
  analyzeResponseOutputSchema,
  type AnalyzeResponseOutput,
  type ReplanCaseInput,
  replanCaseInputSchema,
  replanCaseOutputSchema,
  type ReplanCaseOutput,
} from "./operation-schemas";
import { GroqProvider } from "./groq.provider";
import { aiOperationRegistry } from "./operation-registry";
import { classifyCasePrompt } from "./prompts/classify-case.v1";
import { extractDocumentClaimsPrompt } from "./prompts/extract-document-claims.v1";
import { extractTimelineEventsPrompt } from "./prompts/extract-timeline-events.v1";
import { extractProcedurePrompt } from "./prompts/extract-procedure.v1";
import { verifyProceduralClaimPrompt } from "./prompts/verify-procedural-claim.v1";
import { detectClaimConflictsPrompt } from "./prompts/detect-claim-conflicts.v1";
import { analyzeCasePrompt } from "./prompts/analyze-case.v2";
import { analyzeResponsePrompt } from "./prompts/analyze-response.v1";
import { replanCasePrompt } from "./prompts/replan-case.v1";

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
    @Optional() private readonly budget?: UsageBudgetService,
    @Optional()
    private readonly observability?: ApplicationObservabilityService,
    @Optional() private readonly config?: ConfigService<EnvironmentConfig>,
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

  async extractProcedure(
    input: ExtractProcedureInput,
  ): Promise<AIOperationResult<ExtractProcedureOutput>> {
    const parsed = extractProcedureInputSchema.parse(input);
    const definition = aiOperationRegistry["extract-procedure"];
    const allowed = new Set(
      parsed.sources.flatMap((source) =>
        source.paragraphs.map((paragraph) => paragraph.paragraphId),
      ),
    );
    const inputRefs = [
      parsed.caseId,
      ...parsed.sources.map((source) => source.sourceSnapshotId),
    ];
    const messages = extractProcedurePrompt.buildMessages(
      JSON.stringify(parsed),
    );
    const validate = (output: ExtractProcedureOutput) => {
      for (const claim of output.claims) {
        assertRefsAreSubset(claim.paragraphIds, allowed);
        if (
          !parsed.sources.some(
            (source) => source.sourceSnapshotId === claim.sourceSnapshotId,
          )
        ) {
          throw new AIProviderError(
            "Procedure output referenced an unknown source.",
            "OUTPUT_PROVENANCE_INVALID",
            false,
          );
        }
      }
      for (const step of output.steps)
        assertRefsAreSubset(step.paragraphIds, allowed);
      for (const deadline of output.deadlines)
        assertRefsAreSubset(deadline.paragraphIds, allowed);
    };

    try {
      return await this.execute(
        definition,
        parsed,
        inputRefs,
        messages,
        extractProcedureOutputSchema,
        null,
        validate,
      );
    } catch (error: unknown) {
      if (
        !(error instanceof AIProviderError) ||
        ![
          "AI_INPUT_TOO_LARGE",
          "GROQ_STRUCTURED_OUTPUT_REJECTED",
          "OUTPUT_PROVENANCE_INVALID",
          "PROVIDER_SCHEMA_MISMATCH",
        ].includes(error.code)
      ) {
        throw error;
      }

      // A single constrained repair attempt is safer and cheaper than sending
      // an otherwise recoverable model formatting error straight to a person.
      // The second run is independently audited and passes the same validator.
      const allowedReferences = parsed.sources.map((source) => ({
        sourceSnapshotId: source.sourceSnapshotId,
        paragraphIds: source.paragraphs.map(
          (paragraph) => paragraph.paragraphId,
        ),
      }));
      const repairDefinition = {
        ...definition,
        // A strict-output rejection from the fast extraction model is a model
        // capability failure, not a reason to stop the case for a person. Use
        // the configured reasoning model for the one bounded repair attempt.
        modelPurpose: "REASONING" as const,
        maxCompletionTokens: 4_000,
      };
      return this.execute(
        repairDefinition,
        parsed,
        inputRefs,
        [
          ...messages,
          {
            role: "user",
            content: [
              "The previous attempt failed schema or provenance validation.",
              "Return a fresh result. Copy references only from this exact allowlist; omit unsupported items:",
              JSON.stringify(allowedReferences),
            ].join("\n"),
          },
        ],
        extractProcedureOutputSchema,
        null,
        validate,
      );
    }
  }

  async verifyProceduralClaim(
    input: VerifyProceduralClaimInput,
  ): Promise<AIOperationResult<VerifyProceduralClaimOutput>> {
    const parsed = verifyProceduralClaimInputSchema.parse(input);
    const definition = aiOperationRegistry["verify-procedural-claim"];
    const allowedSources = new Set(
      parsed.sources.map((source) => source.sourceSnapshotId),
    );
    const allowedParagraphs = new Set(
      parsed.sources.flatMap((source) =>
        source.paragraphs.map((paragraph) => paragraph.paragraphId),
      ),
    );
    return this.execute(
      definition,
      parsed,
      [
        parsed.caseId,
        ...parsed.sources.map((source) => source.sourceSnapshotId),
      ],
      verifyProceduralClaimPrompt.buildMessages(JSON.stringify(parsed)),
      verifyProceduralClaimOutputSchema,
      null,
      (output) => {
        if (
          output.supportingSourceSnapshotId &&
          !allowedSources.has(output.supportingSourceSnapshotId)
        ) {
          throw new AIProviderError(
            "Verifier output referenced an unknown source.",
            "OUTPUT_PROVENANCE_INVALID",
            false,
          );
        }
        assertRefsAreSubset(output.supportingParagraphIds, allowedParagraphs);
        if (
          output.verificationStatus === "SUPPORTED" &&
          !output.supportingSourceSnapshotId
        ) {
          throw new AIProviderError(
            "Supported claims require source provenance.",
            "OUTPUT_PROVENANCE_INVALID",
            false,
          );
        }
      },
    );
  }

  async detectClaimConflicts(
    input: ClaimConflictInput,
  ): Promise<AIOperationResult<ClaimConflictOutput>> {
    const parsed = claimConflictInputSchema.parse(input);
    const definition = aiOperationRegistry["detect-claim-conflicts"];
    return this.execute(
      definition,
      parsed,
      [parsed.caseId, parsed.claimA.claimId, parsed.claimB.claimId],
      detectClaimConflictsPrompt.buildMessages(JSON.stringify(parsed)),
      claimConflictOutputSchema,
    );
  }

  async analyzeCase(
    input: CaseAnalysisInput,
  ): Promise<AIOperationResult<CaseAnalysisOutput>> {
    const parsed = caseAnalysisInputSchema.parse(input);
    const definition = aiOperationRegistry["analyze-case"];
    return this.execute(
      definition,
      parsed,
      [parsed.caseId, ...parsed.claims.map((claim) => claim.claimId)],
      analyzeCasePrompt.buildMessages(JSON.stringify(parsed)),
      caseAnalysisOutputSchema,
      null,
      (output) => {
        const allowedClaims = new Set(
          parsed.claims.map((claim) => claim.claimId),
        );
        if (output.supportedClaimIds.some((id) => !allowedClaims.has(id))) {
          throw new AIProviderError(
            "Case analysis referenced an unknown claim.",
            "OUTPUT_PROVENANCE_INVALID",
            false,
          );
        }
      },
    );
  }

  async analyzeResponse(
    input: AnalyzeResponseInput,
  ): Promise<AIOperationResult<AnalyzeResponseOutput>> {
    const parsed = analyzeResponseInputSchema.parse(input);
    const definition = aiOperationRegistry["analyze-response"];
    const allowedClaims = new Set(parsed.claims.map((claim) => claim.claimId));
    return this.execute(
      definition,
      parsed,
      [
        parsed.caseId,
        parsed.responseId,
        ...parsed.claims.map((claim) => claim.claimId),
      ],
      analyzeResponsePrompt.buildMessages(JSON.stringify(parsed)),
      analyzeResponseOutputSchema,
      null,
      (output) => {
        assertRefsAreSubset(output.addressedClaimIds, allowedClaims);
        assertRefsAreSubset(output.unaddressedClaimIds, allowedClaims);
      },
    );
  }

  async replanCase(
    input: ReplanCaseInput,
  ): Promise<AIOperationResult<ReplanCaseOutput>> {
    const parsed = replanCaseInputSchema.parse(input);
    const definition = aiOperationRegistry["replan-case"];
    const allowedClaims = new Set(parsed.supportingClaimIds);
    const allowedProceduralClaims = new Set(
      parsed.supportingProceduralClaimIds,
    );
    return this.execute(
      definition,
      parsed,
      [
        parsed.caseId,
        parsed.responseId,
        ...parsed.supportingClaimIds,
        ...parsed.supportingProceduralClaimIds,
      ],
      replanCasePrompt.buildMessages(JSON.stringify(parsed)),
      replanCaseOutputSchema,
      null,
      (output) => {
        assertRefsAreSubset(output.supportingClaimIds, allowedClaims);
        assertRefsAreSubset(
          output.supportingProceduralClaimIds,
          allowedProceduralClaims,
        );
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
    const serializedInput = JSON.stringify(input);
    if (
      serializedInput.length >
      (this.config?.get("AI_MAX_INPUT_CHARS") ?? 100000)
    ) {
      throw new AIProviderError(
        "AI input exceeded the configured safety bound.",
        "AI_INPUT_TOO_LARGE",
        false,
      );
    }
    if (this.budget && inputRefs[0]) {
      await this.budget.consumeAiCase(inputRefs[0]);
    }
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
      this.observability?.metrics.increment("recourse_ai_operations_total", {
        operation: definition.name,
        status: "succeeded",
      });
      this.observability?.metrics.observe(
        "recourse_ai_operation_latency_ms",
        result.latencyMs,
        { operation: definition.name },
      );
      this.observability?.metrics.increment(
        "recourse_ai_tokens_total",
        { operation: definition.name, model },
        result.usage.totalTokens,
      );
      return { output: outputSchema.parse(result.output), run };
    } catch (error: unknown) {
      await this.runs.fail(run, error);
      this.observability?.metrics.increment("recourse_ai_operations_total", {
        operation: definition.name,
        status: "failed",
      });
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
