import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";

import {
  type AIOperationJobPayload,
  aiOperationJobPayloadSchema,
} from "@recourse/contracts";

import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from "../storage/storage.types";
import { CaseStateMachineService } from "../cases/case-state-machine.service";
import { CaseEventService } from "../cases/case-events.service";
import { Case } from "../cases/schemas/case.schema";
import { Decision } from "../cases/schemas/decision.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";
import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
import { AIOperationService, hashInput } from "./ai-operation.service";
import { AIProviderError } from "./ai.types";
import {
  type ClassifyCaseInput,
  type ExtractDocumentClaimsInput,
} from "./operation-schemas";
import { CaseIntelligenceService } from "../intelligence/case-intelligence.service";
import { Claim } from "../intelligence/schemas/claim.schema";
import { ProceduralClaim } from "../procedure/schemas/procedural-claim.schema";
import { ProcedureVersion } from "../procedure/schemas/procedure-version.schema";
import { CaseResponse } from "../email/schemas/case-response.schema";
import { UsageBudgetExceededError } from "../../common/security/usage-budget.service";

export class AIJobDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AIJobDomainError";
  }
}

@Injectable()
export class AIJobService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Decision.name) private readonly decisionModel: Model<Decision>,
    @InjectModel(Evidence.name) private readonly evidenceModel: Model<Evidence>,
    @InjectModel(EvidenceBlock.name)
    private readonly evidenceBlockModel: Model<EvidenceBlock>,
    @InjectModel(CaseResponse.name)
    private readonly responseModel: Model<CaseResponse>,
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    @InjectModel(ProceduralClaim.name)
    private readonly proceduralClaimModel: Model<ProceduralClaim>,
    @InjectModel(ProcedureVersion.name)
    private readonly procedureVersionModel: Model<ProcedureVersion>,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly operationService: AIOperationService,
    private readonly stateMachine: CaseStateMachineService,
    private readonly events: CaseEventService,
    @Inject(forwardRef(() => CaseIntelligenceService))
    private readonly intelligence: CaseIntelligenceService,
  ) {}

  async process(payload: AIOperationJobPayload): Promise<unknown> {
    const parsed = aiOperationJobPayloadSchema.parse(payload);
    switch (parsed.operation) {
      case "classify-case":
        return this.classify(parsed);
      case "extract-document-claims":
        return this.documentClaims(parsed);
      case "extract-timeline-events":
        return this.timeline(parsed);
      case "extract-procedure":
      case "verify-procedural-claim":
      case "detect-claim-conflicts":
      case "analyze-case":
        if (parsed.operation === "analyze-case") {
          if (!parsed.caseId || parsed.expectedRevision === null) {
            throw new AIJobDomainError(
              "INVALID_CASE_ANALYSIS_PAYLOAD",
              "Case analysis requires a case and expected revision.",
            );
          }
          assertInputHash(parsed, {
            caseId: parsed.caseId,
            revision: parsed.expectedRevision,
          });
          try {
            return await this.intelligence.processCaseAnalysis(
              parsed.caseId,
              parsed.expectedRevision,
              parsed.correlationId,
            );
          } catch (error: unknown) {
            if (error instanceof UsageBudgetExceededError) {
              const current = await this.caseModel
                .findOne({
                  _id: new Types.ObjectId(parsed.caseId),
                  deletedAt: null,
                })
                .exec();
              if (
                current?.status === "CASE_ANALYSIS" &&
                current.revision === parsed.expectedRevision
              ) {
                await this.stateMachine.transition(
                  parsed.caseId,
                  "NEEDS_HUMAN",
                  {
                    actorId: null,
                    actorType: "SYSTEM",
                    correlationId: parsed.correlationId ?? undefined,
                  },
                  {
                    eventType: "CASE_NEEDS_HUMAN",
                    expectedCurrent: ["CASE_ANALYSIS"],
                    expectedRevision: current.revision,
                    idempotencyKey: `case-analysis-budget-exhausted-${parsed.caseId}-${current.revision}`,
                    payload: { reason: "SAFETY_BUDGET_EXHAUSTED" },
                  },
                );
              }
              return { status: "budget-exhausted" };
            }
            if (
              error instanceof ConflictException ||
              error instanceof NotFoundException
            ) {
              throw new AIJobDomainError(
                "STALE_OR_DELETED_CASE",
                "Case analysis is no longer applicable to this case revision.",
              );
            }
            throw error;
          }
        }
        throw new AIJobDomainError(
          "UNSUPPORTED_AI_QUEUE_OPERATION",
          "This AI operation is invoked only by the intelligence boundary.",
        );
      case "analyze-response":
        return this.analyzeResponse(parsed);
      case "replan-case":
        return this.replanCase(parsed);
    }
  }

  async markCaseAnalysisFailure(
    payload: AIOperationJobPayload,
    failureCode: string,
  ): Promise<void> {
    if (!payload.caseId || payload.expectedRevision === null) {
      return;
    }

    const current = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(payload.caseId),
        deletedAt: null,
      })
      .exec();
    if (
      !current ||
      current.status !== "CASE_ANALYSIS" ||
      current.revision !== payload.expectedRevision
    ) {
      return;
    }

    await this.stateMachine.transition(
      payload.caseId,
      "NEEDS_HUMAN",
      {
        actorId: null,
        actorType: "SYSTEM",
        correlationId: payload.correlationId ?? undefined,
      },
      {
        eventType: "CASE_NEEDS_HUMAN",
        expectedCurrent: ["CASE_ANALYSIS"],
        expectedRevision: current.revision,
        idempotencyKey: `case-analysis-failed-${payload.caseId}-${current.revision}-${failureCode}`,
        payload: {
          failureCode: failureCode.slice(0, 100),
          reason: "CASE_ANALYSIS_FAILED",
        },
      },
    );
  }

  private async analyzeResponse(
    payload: AIOperationJobPayload,
  ): Promise<unknown> {
    if (
      !payload.caseId ||
      !payload.responseId ||
      payload.expectedRevision === null
    ) {
      throw new AIJobDomainError(
        "INVALID_RESPONSE_ANALYSIS_PAYLOAD",
        "Response analysis requires a case, response, and revision.",
      );
    }
    const caseDocument = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(payload.caseId),
        deletedAt: null,
      })
      .exec();
    const response = await this.responseModel
      .findOne({
        _id: new Types.ObjectId(payload.responseId),
        caseId: new Types.ObjectId(payload.caseId),
        associationStatus: "ASSOCIATED",
      })
      .exec();
    if (!caseDocument || !response) {
      throw new AIJobDomainError(
        "RESPONSE_NOT_FOUND",
        "Response is unavailable.",
      );
    }
    const responseDocument = response as CaseResponse & { _id: Types.ObjectId };
    if (response.processingStatus === "ANALYZED") {
      return {
        responseId: responseDocument._id.toString(),
        status: "already-analyzed",
      };
    }
    if (response.revision !== payload.expectedRevision) {
      throw new AIJobDomainError(
        "STALE_RESPONSE_REVISION",
        "Response revision is stale.",
      );
    }
    const claims = await this.claimModel
      .find({ caseId: caseDocument._id })
      .limit(100)
      .exec();
    const version = caseDocument.activeProcedureVersionId
      ? await this.procedureVersionModel
          .findById(caseDocument.activeProcedureVersionId)
          .exec()
      : null;
    const verifiedProceduralClaimIds = version
      ? (
          await this.proceduralClaimModel
            .find({
              _id: { $in: version.proceduralClaimIds },
              verificationStatus: "SUPPORTED",
            })
            .select({ _id: 1 })
            .exec()
        ).map((claim) => claim._id.toString())
      : [];
    const input = {
      caseId: payload.caseId,
      claims: claims.map((claim) => ({
        claimId: (claim as Claim & { _id: Types.ObjectId })._id.toString(),
        status: claim.status,
        text: claim.text,
      })),
      responseId: responseDocument._id.toString(),
      responseText: response.bodyText.slice(0, 20000),
      sender: response.fromAddress,
      subject: response.subject,
      verifiedProceduralClaimIds,
    };
    assertInputHash(payload, {
      caseId: payload.caseId,
      responseId: responseDocument._id.toString(),
      responseRevision: response.revision,
    });
    const result = await this.operationService.analyzeResponse(input);
    const analysisUpdate = await this.responseModel
      .updateOne(
        {
          _id: responseDocument._id,
          revision: response.revision,
          processingStatus: "RECEIVED",
        },
        {
          $inc: { revision: 1 },
          $set: {
            addressedClaimIds: result.output.addressedClaimIds,
            analysisRunId: result.run._id,
            analyzedAt: new Date(),
            mentionedDeadlines: result.output.mentionedDeadlines,
            newIssues: result.output.newIssues,
            outcome: result.output.outcome,
            outcomeConfidence: result.output.outcomeConfidence,
            processingStatus: "ANALYZED",
            requestedEvidence: result.output.requestedEvidence,
            statedReason: result.output.statedReason,
            unaddressedClaimIds: result.output.unaddressedClaimIds,
          },
        },
      )
      .exec();
    if (analysisUpdate.modifiedCount !== 1) {
      return {
        responseId: responseDocument._id.toString(),
        status: "already-analyzed",
      };
    }
    await this.events.append({
      actor: {
        actorId: null,
        actorType: "SYSTEM",
        correlationId: payload.correlationId ?? undefined,
      },
      caseId: payload.caseId,
      idempotencyKey: `response-analyzed-${responseDocument._id.toString()}-${result.run._id.toString()}`,
      payload: {
        outcome: result.output.outcome,
        responseId: responseDocument._id.toString(),
        needsHumanReview: result.output.needsHumanReview,
      },
      type: "RESPONSE_ANALYZED",
    });
    return {
      aiRunId: result.run._id.toString(),
      responseId: responseDocument._id.toString(),
      status: "analyzed",
    };
  }

  private async replanCase(payload: AIOperationJobPayload): Promise<unknown> {
    if (
      !payload.caseId ||
      !payload.responseId ||
      payload.expectedRevision === null
    ) {
      throw new AIJobDomainError(
        "INVALID_REPLAN_PAYLOAD",
        "Replanning requires a case, response, and revision.",
      );
    }
    const caseDocument = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(payload.caseId),
        deletedAt: null,
      })
      .exec();
    const response = await this.responseModel
      .findOne({
        _id: new Types.ObjectId(payload.responseId),
        caseId: new Types.ObjectId(payload.caseId),
        processingStatus: "ANALYZED",
      })
      .exec();
    if (!caseDocument || !response)
      throw new AIJobDomainError(
        "REPLAN_CONTEXT_MISSING",
        "Replan context is unavailable.",
      );
    const responseDocument = response as CaseResponse & { _id: Types.ObjectId };
    if (response.revision !== payload.expectedRevision)
      throw new AIJobDomainError(
        "STALE_RESPONSE_REVISION",
        "Response revision is stale.",
      );
    const claims = await this.claimModel
      .find({ caseId: caseDocument._id })
      .limit(100)
      .exec();
    const version = caseDocument.activeProcedureVersionId
      ? await this.procedureVersionModel
          .findById(caseDocument.activeProcedureVersionId)
          .exec()
      : null;
    const proceduralClaims = version
      ? await this.proceduralClaimModel
          .find({
            _id: { $in: version.proceduralClaimIds },
            verificationStatus: "SUPPORTED",
          })
          .select({ _id: 1 })
          .exec()
      : [];
    const input = {
      caseId: payload.caseId,
      newIssues: response.newIssues.map((issue) => ({
        evidenceRequested: issue["evidenceRequested"] === true,
        text: typeof issue["text"] === "string" ? issue["text"] : "",
      })),
      openCriticalGapCount: caseDocument.openCriticalGapCount,
      outcome: response.outcome ?? "UNKNOWN",
      outcomeConfidence: response.outcomeConfidence ?? 0,
      procedureCapabilities: version ? [version.submissionCapability] : [],
      procedureVerified: Boolean(version && version.confidence >= 0.65),
      requestedEvidence: response.requestedEvidence,
      responseId: responseDocument._id.toString(),
      statedReason: response.statedReason,
      supportingClaimIds: claims.map((claim) =>
        (claim as Claim & { _id: Types.ObjectId })._id.toString(),
      ),
      supportingProceduralClaimIds: proceduralClaims.map((claim) =>
        (claim as ProceduralClaim & { _id: Types.ObjectId })._id.toString(),
      ),
      unresolvedContradictionCount: caseDocument.contradictionCount,
    };
    assertInputHash(payload, {
      caseId: payload.caseId,
      responseId: responseDocument._id.toString(),
      responseRevision: response.revision,
    });
    const result = await this.operationService.replanCase(input);
    const replanUpdate = await this.responseModel
      .updateOne(
        { _id: responseDocument._id, revision: response.revision },
        {
          $inc: { revision: 1 },
          $set: {
            replanNextAction: result.output.nextAction,
            replanRationale: result.output.rationale,
            replanRunId: result.run._id,
          },
        },
      )
      .exec();
    if (replanUpdate.modifiedCount !== 1) {
      return {
        responseId: responseDocument._id.toString(),
        status: "already-replanned",
      };
    }
    const nextStatus = nextStatusForReplan(
      response,
      result.output.nextAction,
      result.output.needsHumanReview,
    );
    await this.stateMachine.transition(
      payload.caseId,
      nextStatus,
      {
        actorId: null,
        actorType: "SYSTEM",
        correlationId: payload.correlationId ?? undefined,
      },
      {
        expectedCurrent: ["REPLANNING"],
        expectedRevision: caseDocument.revision,
        idempotencyKey: `replan-transition-${responseDocument._id.toString()}-${result.run._id.toString()}`,
        payload: {
          nextAction: result.output.nextAction,
          rationale: result.output.rationale,
          responseId: responseDocument._id.toString(),
        },
      },
    );
    return {
      aiRunId: result.run._id.toString(),
      nextAction: result.output.nextAction,
      status: nextStatus,
    };
  }

  private async classify(payload: AIOperationJobPayload): Promise<unknown> {
    if (!payload.caseId || !isValidObjectId(payload.caseId)) {
      throw new AIJobDomainError(
        "INVALID_CASE_ID",
        "Case identifier is invalid.",
      );
    }
    const caseDocument = await this.caseModel
      .findOne({ _id: new Types.ObjectId(payload.caseId), deletedAt: null })
      .exec();
    if (!caseDocument) {
      throw new AIJobDomainError(
        "DELETED_OR_MISSING_CASE",
        "Case is unavailable.",
      );
    }
    if (
      caseDocument.status !== "CLASSIFYING" ||
      caseDocument.revision !== payload.expectedRevision
    ) {
      throw new AIJobDomainError(
        "STALE_CASE_REVISION",
        "Case revision is stale.",
      );
    }

    const decision = await this.decisionModel
      .findOne({ caseId: caseDocument._id })
      .exec();
    if (!decision) {
      throw new AIJobDomainError(
        "DECISION_MISSING",
        "Case decision is missing.",
      );
    }

    const input: ClassifyCaseInput = {
      caseId: caseDocument._id.toString(),
      decisionDate: decision.decisionDate?.toISOString() ?? null,
      evidenceRefs: decision.sourceEvidenceId
        ? [decision.sourceEvidenceId.toString()]
        : [],
      institutionName: decision.institutionName,
      jurisdiction: decision.jurisdiction,
      notificationDate: decision.notificationDate?.toISOString() ?? null,
      relationship: decision.relationship,
      statedReason: decision.statedReason,
      decisionType: decision.decisionType,
    };
    assertInputHash(payload, input);
    let result: Awaited<ReturnType<AIOperationService["classifyCase"]>>;
    try {
      result = await this.operationService.classifyCase(input);
    } catch (error: unknown) {
      if (error instanceof AIProviderError && !error.retryable) {
        await this.stateMachine.transition(
          caseDocument._id.toString(),
          "NEEDS_HUMAN",
          {
            actorId: null,
            actorType: "SYSTEM",
            correlationId: payload.correlationId ?? undefined,
          },
          {
            eventType: "CASE_NEEDS_HUMAN",
            expectedCurrent: ["CLASSIFYING"],
            expectedRevision: payload.expectedRevision ?? undefined,
            idempotencyKey: `${payload.idempotencyKey}-needs-human`,
            payload: {
              errorCode: error.code,
              operation: payload.operation,
            },
          },
        );
      }
      throw error;
    }
    const transition = await this.stateMachine.transition(
      caseDocument._id.toString(),
      "PROCEDURE_RESOLUTION",
      {
        actorId: null,
        actorType: "SYSTEM",
        correlationId: payload.correlationId ?? undefined,
      },
      {
        eventType: "CLASSIFICATION_COMPLETE",
        expectedRevision: payload.expectedRevision ?? undefined,
        idempotencyKey: `${payload.idempotencyKey}-complete`,
        expectedCurrent: ["CLASSIFYING"],
        payload: {
          aiRunId: result.run._id.toString(),
          confidence: result.output.confidence,
          decisionType: result.output.decisionType,
          needsHumanReview: result.output.needsHumanReview,
          relationship: result.output.relationship,
          sourceRefs: result.output.sourceRefs,
        },
      },
    );
    return {
      aiRunId: result.run._id.toString(),
      eventId: transition.event._id.toString(),
      needsHumanReview: result.output.needsHumanReview,
      status: "classified",
    };
  }

  private async documentClaims(
    payload: AIOperationJobPayload,
  ): Promise<unknown> {
    const input = await this.evidenceInput(payload);
    assertInputHash(payload, { ...input, imageUrl: null });
    const result = await this.operationService.extractDocumentClaims(input);
    return { aiRunId: result.run._id.toString(), status: "extracted" };
  }

  private async timeline(payload: AIOperationJobPayload): Promise<unknown> {
    const input = await this.evidenceInput(payload);
    assertInputHash(payload, {
      caseId: input.caseId,
      evidenceRefs: input.nativeBlocks,
    });
    const result = await this.operationService.extractTimelineEvents({
      caseId: input.caseId,
      evidenceRefs: input.nativeBlocks,
    });
    return { aiRunId: result.run._id.toString(), status: "extracted" };
  }

  private async evidenceInput(
    payload: AIOperationJobPayload,
  ): Promise<ExtractDocumentClaimsInput> {
    if (
      !payload.caseId ||
      !payload.evidenceId ||
      !isValidObjectId(payload.caseId) ||
      !isValidObjectId(payload.evidenceId)
    ) {
      throw new AIJobDomainError(
        "INVALID_EVIDENCE_ID",
        "Evidence identifiers are invalid.",
      );
    }
    const activeCase = await this.caseModel
      .findOne({ _id: new Types.ObjectId(payload.caseId), deletedAt: null })
      .select({ _id: 1 })
      .exec();
    if (!activeCase) {
      throw new AIJobDomainError(
        "DELETED_OR_MISSING_CASE",
        "Case is unavailable.",
      );
    }
    const evidence = await this.evidenceModel
      .findOne({
        _id: new Types.ObjectId(payload.evidenceId),
        caseId: new Types.ObjectId(payload.caseId),
        deletedAt: null,
      })
      .exec();
    if (
      !evidence ||
      evidence.revision !== payload.expectedRevision ||
      evidence.processingStatus !== "READY"
    ) {
      throw new AIJobDomainError(
        "STALE_EVIDENCE_REVISION",
        "Evidence is unavailable, not ready, or stale.",
      );
    }
    const blocks = await this.evidenceBlockModel
      .find({ evidenceId: evidence._id })
      .sort({ blockIndex: 1 })
      .exec();
    const nativeBlocks = blocks.map((block) => ({
      blockId: block._id.toString(),
      pageNumber: block.pageNumber,
      text: block.text,
    }));
    let imageUrl: string | null = null;
    if (
      evidence.extractionMethod === "IMAGE_METADATA" ||
      nativeBlocks.every((block) => block.text.trim().length < 20)
    ) {
      if (!evidence.mimeType.startsWith("image/")) {
        throw new AIJobDomainError(
          "MULTIMODAL_PAGE_RENDER_REQUIRED",
          "This evidence requires rendered image pages before multimodal extraction.",
        );
      }
      const access = await this.storage.createDownloadAccess(
        evidence.storageKey,
        new Date(Date.now() + 300_000),
      );
      imageUrl = access.url;
    }
    return {
      caseId: payload.caseId,
      evidenceId: payload.evidenceId,
      imageUrl,
      nativeBlocks,
    };
  }
}

function assertInputHash(payload: AIOperationJobPayload, input: unknown): void {
  if (hashInput(input) !== payload.inputHash) {
    throw new AIJobDomainError(
      "AI_INPUT_CHANGED",
      "AI input hash no longer matches the job.",
    );
  }
}

export function nextStatusForReplan(
  response: CaseResponse,
  action: string,
  needsHumanReview: boolean,
):
  | "EVIDENCE_COLLECTION"
  | "READY_TO_APPEAL"
  | "RESOLVED"
  | "EXHAUSTED"
  | "NEEDS_HUMAN" {
  if (needsHumanReview || !response.outcome) return "NEEDS_HUMAN";
  if (
    action === "CLOSE_RESOLVED" &&
    response.outcome === "APPROVED" &&
    typeof response.outcomeConfidence === "number" &&
    response.outcomeConfidence >= 0.9 &&
    response.newIssues.length === 0 &&
    response.requestedEvidence.length === 0
  ) {
    return "RESOLVED";
  }
  if (action === "CLOSE_EXHAUSTED" && response.outcome === "REJECTED") {
    return "EXHAUSTED";
  }
  if (action === "COLLECT_EVIDENCE") return "EVIDENCE_COLLECTION";
  if (action === "GENERATE_APPEAL" || action === "SUBMIT_SECOND_REVIEW") {
    return "READY_TO_APPEAL";
  }
  return "NEEDS_HUMAN";
}
