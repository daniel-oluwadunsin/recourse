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
import { type CaseAnalysisOutput } from "../ai/operation-schemas";
import { CaseEventService } from "../cases/case-events.service";
import { CaseStateMachineService } from "../cases/case-state-machine.service";
import { Case } from "../cases/schemas/case.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";
import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
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
      const timelineResult = await this.ai.extractTimelineEvents({
        caseId,
        evidenceRefs: nativeBlocks,
      });
      extractedTimeline.push(...timelineResult.output.events);
    }
    const boundedClaims = extractedClaims.slice(
      0,
      this.config.get("INTELLIGENCE_MAX_CLAIMS_PER_ANALYSIS") ?? 250,
    );
    const boundedTimeline = extractedTimeline.slice(
      0,
      this.config.get("INTELLIGENCE_MAX_CLAIMS_PER_ANALYSIS") ?? 250,
    );
    const [claims, timeline] = await Promise.all([
      this.claims.upsertExtractedClaims(caseId, boundedClaims, null),
      this.timeline.upsertExtractedEvents(caseId, boundedTimeline),
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
    const analysisResult = await this.ai.analyzeCase(analysisInput);
    await this.caseModel
      .updateOne(
        { _id: refreshedCase._id, deletedAt: null },
        {
          $set: {
            analysis: {
              centralIssues: analysisResult.output.centralIssues,
              computedAt: new Date(),
              modelRunId: analysisResult.run._id.toString(),
              needsHumanReview: analysisResult.output.needsHumanReview,
              recommendedNextSteps: analysisResult.output.recommendedNextSteps,
              supportedClaimIds: analysisResult.output.supportedClaimIds,
              unresolvedFacts: analysisResult.output.unresolvedFacts,
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
    const targetStatus = targetFor(
      current,
      readinessResult,
      analysisResult.output,
    );
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
      analysis: analysisResult.output,
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
    readiness.caps.includes("UNRESOLVED_MATERIAL_CONTRADICTION")
  )
    return "NEEDS_HUMAN";
  if (readiness.score >= 70 && readiness.caps.length === 0)
    return "READY_TO_APPEAL";
  if (caseDocument.status === "CASE_ANALYSIS") return "EVIDENCE_COLLECTION";
  return "NEEDS_HUMAN";
}
