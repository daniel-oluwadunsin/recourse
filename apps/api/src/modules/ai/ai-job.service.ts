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
import { Case } from "../cases/schemas/case.schema";
import { Decision } from "../cases/schemas/decision.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";
import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
import { AIOperationService, hashInput } from "./ai-operation.service";
import {
  type ClassifyCaseInput,
  type ExtractDocumentClaimsInput,
} from "./operation-schemas";
import { CaseIntelligenceService } from "../intelligence/case-intelligence.service";

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
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly operationService: AIOperationService,
    private readonly stateMachine: CaseStateMachineService,
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
    }
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
    const result = await this.operationService.classifyCase(input);
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
