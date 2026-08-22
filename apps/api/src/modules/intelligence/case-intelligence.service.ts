import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { AIOperationService } from "../ai/ai-operation.service";
import { AIProviderError } from "../ai/ai.types";
import { hashInput } from "../ai/ai-operation.service";
import {
  type CaseAnalysisInput,
  type CaseAnalysisOutput,
} from "../ai/operation-schemas";
import { CaseEventService } from "../cases/case-events.service";
import { CaseStateMachineService } from "../cases/case-state-machine.service";
import { Case } from "../cases/schemas/case.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";
import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
import { EvidenceService } from "../evidence/evidence.service";
import { Procedure } from "../procedure/schemas/procedure.schema";
import { ProcedureVersion } from "../procedure/schemas/procedure-version.schema";
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from "../storage/storage.types";
import { ClaimService } from "./claim.service";
import { type ExtractedCaseClaim } from "./claim.service";
import { ContradictionService } from "./contradiction.service";
import { EmbeddingIndexService } from "./embedding-index.service";
import { GraphService } from "./graph.service";
import { ReadinessService } from "./readiness.service";
import { RequirementService } from "./requirement.service";
import { TimelineService } from "./timeline.service";
import { QueueProducerService } from "../queues/queue-producer.service";
import { WORKFLOW_VERSION } from "../queues/queue.constants";
import { type CaseActor } from "../cases/cases.types";

export class CaseIntelligenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CaseIntelligenceError";
  }
}

@Injectable()
export class CaseIntelligenceService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Evidence.name) private readonly evidenceModel: Model<Evidence>,
    @InjectModel(EvidenceBlock.name)
    private readonly evidenceBlockModel: Model<EvidenceBlock>,
    @InjectModel(Procedure.name)
    private readonly procedureModel: Model<Procedure>,
    @InjectModel(ProcedureVersion.name)
    private readonly procedureVersionModel: Model<ProcedureVersion>,
    private readonly ai: AIOperationService,
    private readonly claims: ClaimService,
    private readonly timeline: TimelineService,
    private readonly contradictions: ContradictionService,
    private readonly requirements: RequirementService,
    private readonly graph: GraphService,
    private readonly readiness: ReadinessService,
    private readonly embeddings: EmbeddingIndexService,
    private readonly events: CaseEventService,
    private readonly stateMachine: CaseStateMachineService,
    private readonly config: ConfigService<EnvironmentConfig>,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly ownership: OwnershipAuthorizationService,
    private readonly queueProducer: QueueProducerService,
    private readonly evidenceService: EvidenceService,
  ) {}

  async processCaseAnalysis(
    caseId: string,
    expectedRevision: number,
    correlationId: string | null,
  ): Promise<{
    status: string;
    readiness: number;
    targetStatus: string;
    graphVersion: number;
    analysis: CaseAnalysisOutput;
  }> {
    const caseDocument = await this.analysisCase(caseId, expectedRevision);
    const evidence = await this.evidenceModel
      .find({
        caseId: caseDocument._id,
        deletedAt: null,
        processingStatus: "READY",
      })
      .sort({ createdAt: 1, _id: 1 })
      .limit(this.config.get("INTELLIGENCE_MAX_EVIDENCE_PER_ANALYSIS") ?? 25)
      .exec();
    const extractedClaims: Array<
      ExtractedCaseClaim & { modelRunId: Types.ObjectId }
    > = [];
    const extractedTimeline = [];
    const [existingClaims, existingTimeline] = await Promise.all([
      this.claims.listForAnalysis(caseId),
      this.timeline.listForAnalysis(caseId),
    ]);
    const claimSourceIds = new Set(
      existingClaims.flatMap((claim) =>
        claim.sourceRefs.map((source) => source.sourceId),
      ),
    );
    const timelineSourceIds = new Set(
      existingTimeline.flatMap((event) =>
        event.sourceRefs.map((source) => source.sourceId),
      ),
    );
    for (const item of evidence) {
      const blocks = await this.evidenceBlockModel
        .find({ caseId: caseDocument._id, evidenceId: item._id })
        .sort({ blockIndex: 1 })
        .limit(this.config.get("INTELLIGENCE_MAX_BLOCKS_PER_EVIDENCE") ?? 100)
        .exec();
      const nativeBlocks = blocks.map((block) => ({
        blockId: block._id.toString(),
        pageNumber: block.pageNumber,
        text: block.text,
      }));
      if (nativeBlocks.length === 0) continue;
      const blockIds = nativeBlocks.map((block) => block.blockId);
      const extractionState =
        item.extractionMetadata &&
        typeof item.extractionMetadata.intelligence === "object" &&
        item.extractionMetadata.intelligence !== null
          ? (item.extractionMetadata.intelligence as Record<string, unknown>)
          : {};
      const claimsAlreadyExtracted =
        Boolean(extractionState.claimsExtractedAt) ||
        blockIds.some((blockId) => claimSourceIds.has(blockId));
      const timelineAlreadyExtracted =
        Boolean(extractionState.timelineExtractedAt) ||
        blockIds.some((blockId) => timelineSourceIds.has(blockId));
      const imageUrl =
        item.mimeType.startsWith("image/") &&
        nativeBlocks.every((block) => block.text.trim().length < 20)
          ? (
              await this.storage.createDownloadAccess(
                item.storageKey,
                new Date(Date.now() + 300_000),
              )
            ).url
          : null;
      if (!claimsAlreadyExtracted) {
        const claimResult = await this.ai.extractDocumentClaims({
          caseId,
          evidenceId: item._id.toString(),
          imageUrl,
          nativeBlocks,
        });
        extractedClaims.push(
          ...claimResult.output.claims.map((claim) => ({
            ...claim,
            modelRunId: claimResult.run._id,
          })),
        );
      }
      if (!timelineAlreadyExtracted) {
        const timelineResult = await this.ai.extractTimelineEvents({
          caseId,
          evidenceRefs: nativeBlocks,
        });
        extractedTimeline.push(...timelineResult.output.events);
      }
      if (
        !extractionState.claimsExtractedAt ||
        !extractionState.timelineExtractedAt
      ) {
        await this.evidenceModel
          .updateOne(
            { _id: item._id, deletedAt: null },
            {
              $set: {
                "extractionMetadata.intelligence.claimsExtractedAt": new Date(),
                "extractionMetadata.intelligence.timelineExtractedAt":
                  new Date(),
              },
            },
          )
          .exec();
      }
    }
    const boundedClaims = extractedClaims.slice(
      0,
      this.config.get("INTELLIGENCE_MAX_CLAIMS_PER_ANALYSIS") ?? 250,
    );
    const boundedTimeline = extractedTimeline.slice(
      0,
      this.config.get("INTELLIGENCE_MAX_CLAIMS_PER_ANALYSIS") ?? 250,
    );
    await Promise.all([
      this.claims.upsertExtractedClaims(caseId, boundedClaims, null),
      this.timeline.upsertExtractedEvents(caseId, boundedTimeline),
    ]);
    const [claims, timeline] = await Promise.all([
      this.claims.listForAnalysis(caseId),
      this.timeline.listForAnalysis(caseId),
    ]);
    await this.embeddings.indexEvidenceBlocks(caseDocument._id);
    const contradictionResult = await this.contradictions.analyzeCase(caseId);
    const requirementMatches = await this.requirements.matchCase(caseId);
    const graph = await this.graph.rebuild(caseId);
    const refreshedCase = await this.analysisCase(caseId, undefined);
    const procedure = refreshedCase.activeProcedureId
      ? await this.procedureModel
          .findById(refreshedCase.activeProcedureId)
          .exec()
      : null;
    const procedureVersion = refreshedCase.activeProcedureVersionId
      ? await this.procedureVersionModel
          .findById(refreshedCase.activeProcedureVersionId)
          .exec()
      : null;
    const analysisInput = {
      caseId,
      claims: claims.map((claim) => ({
        claimId: claim._id.toString(),
        sourceRefs: claim.sourceRefs.map((source) => source.sourceId),
        status: claim.status,
        text: claim.text,
      })),
      contradictions: contradictionResult.contradictions.map((item) => ({
        contradictionId: item._id.toString(),
        explanation: item.explanation,
        status: item.status,
      })),
      requirements: requirementMatches.map((item) => ({
        requirementKey: item.requirementKey,
        status: item.status,
        text: item.requirementText,
      })),
      timeline: timeline.map((item) => ({
        date: item.normalizedDate?.toISOString() ?? null,
        eventId: item._id.toString(),
        text: item.eventText,
      })),
    };
    const providerAnalysisInput = shouldCompactAnalysisInput(analysisInput)
      ? compactAnalysisInput(analysisInput)
      : analysisInput;
    let analysisResult;
    try {
      analysisResult = await this.ai.analyzeCase(providerAnalysisInput);
    } catch (error: unknown) {
      if (
        !(error instanceof AIProviderError) ||
        ![
          "AI_INPUT_TOO_LARGE",
          "GROQ_STRUCTURED_OUTPUT_REJECTED",
          "PROVIDER_SCHEMA_MISMATCH",
        ].includes(error.code)
      ) {
        throw error;
      }
      // Groq reports some context-window and structured-generation failures as
      // HTTP 400 rather than 413. The operation-level schema retry has already
      // run by this point, so retry once with a bounded, provenance-preserving
      // view of the same durable case record.
      analysisResult = await this.ai.analyzeCase(
        compactAnalysisInput(analysisInput),
      );
    }
    const actionableInputRefs = new Set([
      ...analysisInput.requirements
        .filter((requirement) =>
          ["MISSING", "PARTIAL", "UNCERTAIN"].includes(requirement.status),
        )
        .map((requirement) => requirement.requirementKey),
      ...analysisInput.contradictions
        .filter((contradiction) =>
          ["OPEN", "UNKNOWN"].includes(contradiction.status),
        )
        .map((contradiction) => contradiction.contradictionId),
    ]);
    const analysisOutput: CaseAnalysisOutput = {
      ...analysisResult.output,
      unresolvedFacts: analysisResult.output.unresolvedFacts
        .filter(
          (fact) =>
            fact.resolutionOwner === "INSTITUTION" ||
            fact.inputRefs.some((reference) =>
              actionableInputRefs.has(reference),
            ),
        )
        .map((fact) => ({
          ...fact,
          blocking: isDraftBlockingFact(fact),
        })),
    };
    await this.caseModel
      .updateOne(
        { _id: refreshedCase._id, deletedAt: null },
        {
          $set: {
            analysis: {
              centralIssues: analysisOutput.centralIssues,
              computedAt: new Date(),
              modelRunId: analysisResult.run._id.toString(),
              needsHumanReview: analysisOutput.needsHumanReview,
              recommendedNextSteps: analysisOutput.recommendedNextSteps,
              supportedClaimIds: analysisOutput.supportedClaimIds,
              unresolvedFacts: analysisOutput.unresolvedFacts,
              factAnswers: refreshedCase.analysis?.factAnswers ?? [],
            },
          },
        },
      )
      .exec();
    const readinessResult = this.readiness.calculate({
      caseDocument: refreshedCase,
      claims,
      contradictions: contradictionResult.contradictions,
      procedure,
      procedureVersion,
      requirements: requirementMatches,
      timeline,
    });
    await this.readiness.persist(caseId, readinessResult);
    await this.emitIntelligenceEvents(
      caseId,
      correlationId,
      claims.length,
      timeline.length,
      contradictionResult.discovered,
      requirementMatches,
      readinessResult,
      graph.version,
    );
    const current = await this.analysisCase(caseId, undefined);
    const targetStatus = targetFor(current, readinessResult, analysisOutput);
    const transition = await this.stateMachine.transition(
      caseId,
      targetStatus,
      {
        actorId: null,
        actorType: "SYSTEM",
        correlationId: correlationId ?? undefined,
      },
      {
        eventType: "CASE_ANALYSIS_COMPLETED",
        expectedCurrent: ["CASE_ANALYSIS"],
        expectedRevision: current.revision,
        idempotencyKey: `case-analysis-completed-${caseId}-${current.revision}`,
        payload: {
          aiRunId: analysisResult.run._id.toString(),
          readinessScore: readinessResult.score,
          targetStatus,
        },
      },
    );
    return {
      analysis: analysisOutput,
      graphVersion: graph.version,
      readiness: readinessResult.score,
      status: transition.case.status,
      targetStatus,
    };
  }

  async getAnalysis(
    ownerId: string,
    caseId: string,
  ): Promise<Record<string, unknown>> {
    const value = await this.ownedCase(ownerId, caseId);
    return {
      analysis: value.analysis,
      contradictionCount: value.contradictionCount,
      openCriticalGapCount: value.openCriticalGapCount,
      readiness: value.readiness,
    };
  }

  async retryAnalysis(
    ownerId: string,
    caseId: string,
    actor: CaseActor,
  ): Promise<{ caseId: string; status: string }> {
    const value = await this.ownedCase(ownerId, caseId);
    if (
      ![
        "NEEDS_HUMAN",
        "EVIDENCE_COLLECTION",
        "READY_TO_APPEAL",
        "CASE_ANALYSIS",
      ].includes(value.status)
    ) {
      throw new ConflictException(
        "Case analysis can only be retried from evidence collection, human review, an in-progress analysis, or before appeal drafting.",
      );
    }
    const readyEvidence = await this.evidenceModel.exists({
      caseId: value._id,
      deletedAt: null,
      processingStatus: "READY",
    });
    if (!readyEvidence || !value.activeProcedureVersionId) {
      throw new ConflictException(
        "Ready evidence and a verified procedure are required for analysis.",
      );
    }
    const analysisCase =
      value.status === "CASE_ANALYSIS"
        ? value
        : (
            await this.stateMachine.transition(caseId, "CASE_ANALYSIS", actor, {
              expectedCurrent: [
                "NEEDS_HUMAN",
                "EVIDENCE_COLLECTION",
                "READY_TO_APPEAL",
              ],
              expectedRevision: value.revision,
              idempotencyKey: `case-analysis-user-retry-${caseId}-${value.revision}`,
              payload: { recovery: "USER_REQUESTED_ANALYSIS_RETRY" },
            })
          ).case;
    const inputHash = hashInput({
      caseId,
      revision: analysisCase.revision,
    });
    await this.queueProducer.enqueueAIOperation({
      caseId,
      correlationId: actor.correlationId ?? null,
      evidenceId: null,
      expectedRevision: analysisCase.revision,
      // A user retry must not collide with an earlier completed/stale BullMQ
      // job for the same durable revision. The request correlation id keeps a
      // single HTTP attempt idempotent while allowing a later explicit retry.
      idempotencyKey: `analyze-case-user-retry-${caseId}-${analysisCase.revision}-${actor.correlationId ?? inputHash}`,
      inputHash,
      operation: "analyze-case",
      workflowVersion: WORKFLOW_VERSION,
    });
    return { caseId, status: analysisCase.status };
  }

  async approveAnalysis(
    ownerId: string,
    caseId: string,
    actor: CaseActor,
  ): Promise<{ caseId: string; status: string }> {
    const value = await this.ownedCase(ownerId, caseId);
    if (
      value.status !== "NEEDS_HUMAN" ||
      !value.analysis ||
      !hasStructuredFacts(value.analysis.unresolvedFacts) ||
      value.analysis.unresolvedFacts.some(isDraftBlockingFact) ||
      !value.readiness?.computedAt ||
      value.readiness.score < 70 ||
      value.readiness.caps.length > 0
    ) {
      throw new ConflictException(
        "Analysis can only be approved after blocking fact work is complete, with readiness of at least 70 and no safety cap.",
      );
    }
    const transition = await this.stateMachine.transition(
      caseId,
      "READY_TO_APPEAL",
      actor,
      {
        expectedCurrent: ["NEEDS_HUMAN"],
        expectedRevision: value.revision,
        idempotencyKey: `case-analysis-user-approved-${caseId}-${value.revision}`,
        payload: {
          recovery: "USER_ACCEPTED_ANALYSIS_UNCERTAINTY",
          readinessScore: value.readiness.score,
          unresolvedFacts: value.analysis.unresolvedFacts,
        },
      },
    );
    return { caseId, status: transition.case.status };
  }

  async answerOpenFacts(
    ownerId: string,
    caseId: string,
    answers: Array<{ question: string; answer: string }>,
    actor: CaseActor,
  ): Promise<{ caseId: string; evidenceId: string; status: string }> {
    const value = await this.ownedCase(ownerId, caseId);
    if (
      !["NEEDS_HUMAN", "READY_TO_APPEAL"].includes(value.status) ||
      !value.analysis ||
      !hasStructuredFacts(value.analysis.unresolvedFacts)
    ) {
      throw new ConflictException(
        "Re-run case analysis before answering open fact questions.",
      );
    }
    const userFacts = value.analysis.unresolvedFacts.filter(
      (fact) => fact.resolutionOwner === "USER" && fact.userQuestion,
    );
    if (userFacts.length === 0) {
      throw new ConflictException(
        "This case has no open fact questions assigned to the user.",
      );
    }
    const openQuestions = new Map(
      userFacts.map((fact) => [
        normalizeQuestion(fact.userQuestion!),
        fact.userQuestion!,
      ]),
    );
    const submitted = new Map<string, { question: string; answer: string }>();
    for (const entry of answers) {
      const key = normalizeQuestion(entry.question);
      const canonicalQuestion = openQuestions.get(key);
      const answer = entry.answer.trim();
      if (!canonicalQuestion || !answer || submitted.has(key)) {
        throw new ConflictException(
          "Answers must uniquely correspond to the current user-assigned questions.",
        );
      }
      submitted.set(key, { question: canonicalQuestion, answer });
    }
    if (submitted.size !== openQuestions.size) {
      throw new ConflictException(
        "Answer every question assigned to you before analysis continues. Use ‘I do not know’ when the information is unavailable.",
      );
    }

    const orderedAnswers = [...submitted.values()];
    const evidence = await this.evidenceService.createTextEvidence(
      ownerId,
      caseId,
      {
        kind: "TEXT",
        label: "Answers to open case facts",
        text: orderedAnswers
          .map(
            (entry, index) =>
              `Question ${index + 1}: ${entry.question}\nUser answer: ${entry.answer}`,
          )
          .join("\n\n"),
      },
      {
        actorId: actor.actorId,
        actorType: "USER",
        correlationId: actor.correlationId,
      },
    );
    const answeredAt = new Date();
    await this.caseModel
      .updateOne(
        { _id: value._id, deletedAt: null },
        {
          $set: {
            "analysis.factAnswers": [
              ...(value.analysis.factAnswers ?? []),
              ...orderedAnswers.map((entry) => ({
                ...entry,
                answeredAt,
                evidenceId: evidence.id,
              })),
            ],
          },
        },
      )
      .exec();

    const transition = await this.stateMachine.transition(
      caseId,
      "CASE_ANALYSIS",
      actor,
      {
        expectedCurrent: ["NEEDS_HUMAN", "READY_TO_APPEAL"],
        expectedRevision: value.revision,
        idempotencyKey: `case-fact-answers-${caseId}-${value.revision}`,
        payload: {
          answerCount: orderedAnswers.length,
          evidenceId: evidence.id,
          recovery: "USER_ANSWERED_OPEN_FACTS",
        },
      },
    );
    const inputHash = hashInput({
      caseId,
      revision: transition.case.revision,
    });
    await this.queueProducer.enqueueAIOperation({
      caseId,
      correlationId: actor.correlationId ?? null,
      evidenceId: null,
      expectedRevision: transition.case.revision,
      idempotencyKey: `analyze-case-${caseId}-${transition.case.revision}-${inputHash}`,
      inputHash,
      operation: "analyze-case",
      workflowVersion: WORKFLOW_VERSION,
    });
    return { caseId, evidenceId: evidence.id, status: transition.case.status };
  }

  private async emitIntelligenceEvents(
    caseId: string,
    correlationId: string | null,
    claimCount: number,
    timelineCount: number,
    discovered: Array<{
      _id: Types.ObjectId;
      status: string;
      severity: string;
    }>,
    requirements: Array<{
      _id: Types.ObjectId;
      status: string;
      critical: boolean;
    }>,
    readiness: { score: number; caps: string[] },
    graphVersion: number,
  ): Promise<void> {
    const actor = {
      actorId: null,
      actorType: "SYSTEM" as const,
      correlationId: correlationId ?? undefined,
    };
    await this.events.append({
      actor,
      caseId,
      idempotencyKey: `claims-updated-${caseId}-${claimCount}`,
      payload: { claimCount },
      type: "CLAIMS_UPDATED",
    });
    await this.events.append({
      actor,
      caseId,
      idempotencyKey: `timeline-updated-${caseId}-${timelineCount}`,
      payload: { eventCount: timelineCount },
      type: "TIMELINE_UPDATED",
    });
    for (const contradiction of discovered.filter((item) =>
      ["OPEN", "UNKNOWN"].includes(item.status),
    )) {
      await this.events.append({
        actor,
        caseId,
        idempotencyKey: `contradiction-discovered-${contradiction._id.toString()}`,
        payload: {
          contradictionId: contradiction._id.toString(),
          severity: contradiction.severity,
        },
        type: "CONTRADICTION_DISCOVERED",
      });
    }
    for (const requirement of requirements.filter(
      (item) =>
        item.critical &&
        ["MISSING", "UNCERTAIN", "PARTIAL"].includes(item.status),
    )) {
      await this.events.append({
        actor,
        caseId,
        idempotencyKey: `case-gap-discovered-${requirement._id.toString()}-${requirement.status}`,
        payload: {
          requirementId: requirement._id.toString(),
          status: requirement.status,
        },
        type: "CASE_GAP_DISCOVERED",
      });
    }
    await this.events.append({
      actor,
      caseId,
      idempotencyKey: `readiness-updated-${caseId}-${readiness.score}`,
      payload: { caps: readiness.caps, score: readiness.score, version: "v1" },
      type: "READINESS_UPDATED",
    });
    await this.events.append({
      actor,
      caseId,
      idempotencyKey: `graph-rebuilt-${caseId}-${graphVersion}`,
      payload: { graphVersion },
      type: "GRAPH_REBUILT",
    });
  }

  private async analysisCase(
    caseId: string,
    expectedRevision: number | undefined,
  ): Promise<Case & { _id: Types.ObjectId }> {
    if (!isValidObjectId(caseId))
      throw new NotFoundException("Case not found.");
    const value = await this.caseModel
      .findOne({ _id: new Types.ObjectId(caseId), deletedAt: null })
      .exec();
    if (!value) throw new NotFoundException("Case not found.");
    if (
      expectedRevision !== undefined &&
      (value.status !== "CASE_ANALYSIS" || value.revision !== expectedRevision)
    ) {
      throw new ConflictException("Case analysis revision is stale.");
    }
    return value;
  }

  private async ownedCase(
    ownerId: string,
    caseId: string,
  ): Promise<Case & { _id: Types.ObjectId }> {
    if (!isValidObjectId(caseId))
      throw new NotFoundException("Case not found.");
    const value = await this.caseModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: new Types.ObjectId(caseId),
          deletedAt: null,
        }),
      )
      .exec();
    if (!value) throw new NotFoundException("Case not found.");
    return value;
  }
}

function targetFor(
  caseDocument: Case,
  readiness: { score: number; caps: string[] },
  analysis: CaseAnalysisOutput,
): "EVIDENCE_COLLECTION" | "READY_TO_APPEAL" | "NEEDS_HUMAN" {
  if (
    analysis.needsHumanReview ||
    analysis.unresolvedFacts.some(isDraftBlockingFact) ||
    readiness.caps.includes("UNRESOLVED_MATERIAL_CONTRADICTION")
  )
    return "NEEDS_HUMAN";
  if (readiness.score >= 70 && readiness.caps.length === 0)
    return "READY_TO_APPEAL";
  if (caseDocument.status === "CASE_ANALYSIS") return "EVIDENCE_COLLECTION";
  return "NEEDS_HUMAN";
}

function compactAnalysisInput(input: CaseAnalysisInput): CaseAnalysisInput {
  return {
    ...input,
    claims: input.claims.slice(0, 10).map((claim) => ({
      ...claim,
      sourceRefs: claim.sourceRefs.slice(0, 4),
      text: compactText(claim.text),
    })),
    contradictions: input.contradictions.slice(0, 4).map((item) => ({
      ...item,
      explanation: compactText(item.explanation),
    })),
    requirements: input.requirements.slice(0, 4).map((requirement) => ({
      ...requirement,
      text: compactText(requirement.text),
    })),
    timeline: input.timeline.slice(0, 6).map((event) => ({
      ...event,
      text: compactText(event.text),
    })),
  };
}

function shouldCompactAnalysisInput(input: CaseAnalysisInput): boolean {
  return input.claims.length > 20 || JSON.stringify(input).length > 12_000;
}

function compactText(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 400 ? `${normalized.slice(0, 397)}…` : normalized;
}

function normalizeQuestion(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function hasStructuredFacts(value: readonly unknown[]): boolean {
  return value.every(
    (fact) =>
      typeof fact === "object" &&
      fact !== null &&
      "resolutionOwner" in fact &&
      "blocking" in fact,
  );
}

function isDraftBlockingFact(
  fact: CaseAnalysisOutput["unresolvedFacts"][number],
): boolean {
  // Information only the institution can disclose must be requested in the
  // appeal; treating it as a pre-appeal blocker would create a deadlock.
  return fact.resolutionOwner !== "INSTITUTION";
}
