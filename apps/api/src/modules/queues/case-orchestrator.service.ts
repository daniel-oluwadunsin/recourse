import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { UnrecoverableError } from "bullmq";
import { type Model, Types } from "mongoose";

import {
  type CaseEventJobPayload,
  type EvidenceProcessingJobPayload,
  type ProcedureRetrievalJobPayload,
} from "@recourse/contracts";

import { CaseStateMachineService } from "../cases/case-state-machine.service";
import { ActivityPubSubService } from "./activity-pubsub.service";
import { QUEUE_NAMES, WORKFLOW_VERSION } from "./queue.constants";
import { QueueProducerService } from "./queue-producer.service";
import { WorkflowDispatchService } from "./workflow-dispatch.service";
import {
  CaseEvent,
  type CaseEventDocument,
} from "../cases/schemas/case-event.schema";
import { Case } from "../cases/schemas/case.schema";
import { Decision } from "../cases/schemas/decision.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";
import { hashInput } from "../ai/ai-operation.service";
import { type ClassifyCaseInput } from "../ai/operation-schemas";

@Injectable()
export class CaseOrchestratorService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(CaseEvent.name)
    private readonly caseEventModel: Model<CaseEvent>,
    @InjectModel(Evidence.name)
    private readonly evidenceModel: Model<Evidence>,
    @InjectModel(Decision.name)
    private readonly decisionModel: Model<Decision>,
    @Inject(forwardRef(() => CaseStateMachineService))
    private readonly stateMachine: CaseStateMachineService,
    private readonly activityPubSub: ActivityPubSubService,
    private readonly queueProducer: QueueProducerService,
    private readonly workflowDispatch: WorkflowDispatchService,
  ) {}

  async handleCaseEvent(payload: CaseEventJobPayload): Promise<{
    eventType: string;
    scheduled: string[];
  }> {
    if (
      !Types.ObjectId.isValid(payload.eventId) ||
      !Types.ObjectId.isValid(payload.caseId)
    ) {
      throw new UnrecoverableError("Case event identifiers are invalid.");
    }
    const event = await this.caseEventModel
      .findOne({
        _id: new Types.ObjectId(payload.eventId),
        caseId: new Types.ObjectId(payload.caseId),
        sequence: payload.eventSequence,
      })
      .exec();
    if (!event) {
      throw new UnrecoverableError("Persisted case event was not found.");
    }

    const scheduled: string[] = [];
    if (event.type === "CASE_CREATED") {
      const activeCase = await this.caseModel
        .findOne({ _id: event.caseId, deletedAt: null })
        .exec();
      if (activeCase?.status === "INTAKE") {
        const transition = await this.stateMachine.transition(
          activeCase._id.toString(),
          "CLASSIFYING",
          {
            actorId: null,
            actorType: "SYSTEM",
            correlationId: event.correlationId ?? undefined,
          },
          {
            expectedCurrent: ["INTAKE"],
            idempotencyKey: `classifying-${activeCase._id.toString()}-${activeCase.revision}`,
            payload: { triggerEventId: event._id.toString() },
          },
        );
        await this.scheduleClassification(
          transition.case,
          event.correlationId,
          scheduled,
        );
      }
    }
    if (
      event.type === "CASE_STATUS_CHANGED" &&
      readPayloadString(event, "to") === "CLASSIFYING"
    ) {
      const activeCase = await this.caseModel
        .findOne({ _id: event.caseId, deletedAt: null })
        .exec();
      if (activeCase?.status === "CLASSIFYING") {
        await this.scheduleClassification(
          activeCase,
          event.correlationId,
          scheduled,
        );
      }
    }
    if (
      event.type === "CLASSIFICATION_COMPLETE" ||
      (event.type === "CASE_STATUS_CHANGED" &&
        readPayloadString(event, "to") === "PROCEDURE_RESOLUTION")
    ) {
      const activeCase = await this.caseModel
        .findOne({ _id: event.caseId, deletedAt: null })
        .exec();
      if (activeCase?.status === "PROCEDURE_RESOLUTION") {
        const classificationHash = hashInput(event.payload);
        const payload: ProcedureRetrievalJobPayload = {
          caseId: activeCase._id.toString(),
          correlationId: event.correlationId,
          expectedRevision: activeCase.revision,
          classificationHash,
          queryHash: hashInput({
            caseId: activeCase._id.toString(),
            revision: activeCase.revision,
            classificationHash,
          }),
          idempotencyKey: `procedure-resolve-${activeCase._id.toString()}-${activeCase.revision}-${classificationHash}`,
          workflowVersion: WORKFLOW_VERSION,
        };
        await this.queueProducer.enqueueProcedureRetrieval(payload);
        scheduled.push(`procedure-retrieval:${activeCase._id.toString()}`);
      }
    }
    if (event.type === "EVIDENCE_UPLOADED") {
      const evidenceId = readPayloadString(event, "evidenceId");
      if (evidenceId) {
        if (!Types.ObjectId.isValid(evidenceId)) {
          throw new UnrecoverableError("Evidence identifier is invalid.");
        }
        const activeCase = await this.caseModel
          .findOne({ _id: event.caseId, deletedAt: null })
          .select({ _id: 1 })
          .exec();
        const evidence = await this.evidenceModel
          .findOne({
            _id: new Types.ObjectId(evidenceId),
            caseId: event.caseId,
          })
          .exec();

        if (
          activeCase &&
          evidence &&
          evidence.deletedAt === null &&
          evidence.processingStatus === "UPLOADED" &&
          evidence.sha256
        ) {
          const evidencePayload: EvidenceProcessingJobPayload = {
            caseId: event.caseId.toString(),
            correlationId: event.correlationId,
            evidenceId: evidence._id.toString(),
            expectedRevision: evidence.revision,
            idempotencyKey: `evidence-process-${evidence._id.toString()}-${evidence.sha256}`,
            sha256: evidence.sha256,
            workflowVersion: WORKFLOW_VERSION,
          };
          await this.queueProducer.enqueueEvidenceProcessing(evidencePayload);
          scheduled.push(`${QUEUE_NAMES.EVIDENCE_PROCESSING}:${evidence._id}`);
        }
      }
    }

    if (event.type === "EVIDENCE_PROCESSED") {
      const activeCase = await this.caseModel
        .findOne({ _id: event.caseId, deletedAt: null })
        .exec();
      if (activeCase?.status === "EVIDENCE_COLLECTION") {
        const transition = await this.stateMachine.transition(
          activeCase._id.toString(),
          "CASE_ANALYSIS",
          {
            actorId: null,
            actorType: "SYSTEM",
            correlationId: event.correlationId ?? undefined,
          },
          {
            eventType: "CASE_STATUS_CHANGED",
            expectedCurrent: ["EVIDENCE_COLLECTION"],
            expectedRevision: activeCase.revision,
            idempotencyKey: `case-analysis-start-${activeCase._id.toString()}-${activeCase.revision}`,
            payload: {
              triggerEventId: event._id.toString(),
              to: "CASE_ANALYSIS",
            },
          },
        );
        const inputHash = hashInput({
          caseId: transition.case._id.toString(),
          revision: transition.case.revision,
        });
        await this.queueProducer.enqueueAIOperation({
          caseId: transition.case._id.toString(),
          correlationId: event.correlationId,
          evidenceId: null,
          expectedRevision: transition.case.revision,
          idempotencyKey: `analyze-case-${transition.case._id.toString()}-${transition.case.revision}-${inputHash}`,
          inputHash,
          operation: "analyze-case",
          workflowVersion: WORKFLOW_VERSION,
        });
        scheduled.push(
          `ai-operations:analyze-case:${activeCase._id.toString()}`,
        );
      }
    }

    await this.activityPubSub.publish({
      caseId: event.caseId.toString(),
      sequence: event.sequence,
    });
    await this.workflowDispatch.markCompleted(payload.dispatchId);

    return { eventType: event.type, scheduled };
  }

  private async scheduleClassification(
    activeCase: Case & { _id: Types.ObjectId },
    correlationId: string | null,
    scheduled: string[],
  ): Promise<void> {
    const decision = await this.decisionModel
      .findOne({ caseId: activeCase._id })
      .exec();
    if (!decision) {
      return;
    }
    const input: ClassifyCaseInput = {
      caseId: activeCase._id.toString(),
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
    const inputHash = hashInput(input);
    await this.queueProducer.enqueueAIOperation({
      caseId: activeCase._id.toString(),
      correlationId,
      evidenceId: null,
      expectedRevision: activeCase.revision,
      idempotencyKey: `classify-case-${activeCase._id.toString()}-${activeCase.revision}-${inputHash}`,
      inputHash,
      operation: "classify-case",
      workflowVersion: WORKFLOW_VERSION,
    });
    scheduled.push(`ai-operations:classify-case:${activeCase._id.toString()}`);
  }
}

function readPayloadString(
  event: CaseEventDocument,
  key: string,
): string | null {
  const value = event.payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
