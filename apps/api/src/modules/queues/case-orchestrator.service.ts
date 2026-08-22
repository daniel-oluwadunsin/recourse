import { forwardRef, Inject, Injectable, Optional } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { UnrecoverableError } from "bullmq";
import { type Model, Types } from "mongoose";

import {
  type CaseEventJobPayload,
  type AIOperationJobPayload,
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
import { CaseResponse } from "../email/schemas/case-response.schema";
import { DeadlineService } from "../email/deadline.service";
import { EmailInboundService } from "../email/email-inbound.service";

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
    @Optional()
    @InjectModel(CaseResponse.name)
    private readonly responseModel?: Model<CaseResponse>,
    @Optional()
    @Inject(forwardRef(() => DeadlineService))
    private readonly deadlineService?: DeadlineService,
    @Optional()
    @Inject(forwardRef(() => EmailInboundService))
    private readonly emailInboundService?: EmailInboundService,
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
    if (event.type === "DECISION_CORRECTED") {
      const activeCase = await this.caseModel
        .findOne({ _id: event.caseId, deletedAt: null })
        .exec();
      if (activeCase?.status === "NEEDS_HUMAN") {
        await this.stateMachine.transition(
          activeCase._id.toString(),
          "PROCEDURE_RESOLUTION",
          {
            actorId: null,
            actorType: "SYSTEM",
            correlationId: event.correlationId ?? undefined,
          },
          {
            expectedCurrent: ["NEEDS_HUMAN"],
            expectedRevision: activeCase.revision,
            idempotencyKey: `procedure-reresolve-after-decision-correction-${activeCase._id.toString()}-${activeCase.revision}`,
            payload: { triggerEventId: event._id.toString() },
          },
        );
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
      const evidenceId = readPayloadString(event, "evidenceId");
      if (evidenceId && this.emailInboundService) {
        const evidence = await this.evidenceModel
          .findOne({
            _id: new Types.ObjectId(evidenceId),
            caseId: event.caseId,
            deletedAt: null,
          })
          .select({ kind: 1 })
          .exec();
        if (evidence?.kind === "INSTITUTION_RESPONSE") {
          const ingested =
            await this.emailInboundService.ingestUploadedResponse(
              event.caseId.toString(),
              evidenceId,
              event.correlationId,
            );
          if (ingested.responseId) {
            scheduled.push(`response-analysis:${ingested.responseId}`);
          }
        }
      }
      await this.scheduleCaseAnalysisIfReady(event, scheduled);
    }

    // Evidence can finish before procedure retrieval. Re-check durable ready
    // evidence after either terminal procedure outcome so event ordering (or
    // an honestly unresolved procedure) cannot strand case analysis. Analysis
    // may still return NEEDS_HUMAN; unresolved procedure claims continue to
    // prevent READY_TO_APPEAL in the readiness service.
    if (
      event.type === "PROCEDURE_RESOLVED" ||
      (event.type === "CASE_NEEDS_HUMAN" &&
        Boolean(readPayloadString(event, "procedureId")))
    ) {
      await this.scheduleCaseAnalysisIfReady(event, scheduled);
    }

    if (event.type === "RESPONSE_RECEIVED") {
      const responseId = readPayloadString(event, "responseId");
      if (
        this.responseModel &&
        responseId &&
        Types.ObjectId.isValid(responseId)
      ) {
        const activeCase = await this.caseModel
          .findOne({ _id: event.caseId, deletedAt: null })
          .exec();
        const response = await this.responseModel
          .findOne({
            _id: new Types.ObjectId(responseId),
            associationStatus: "ASSOCIATED",
            caseId: event.caseId,
          })
          .exec();
        if (activeCase && response) {
          const responseDocument = response as CaseResponse & {
            _id: Types.ObjectId;
          };
          if (activeCase.status === "AWAITING_RESPONSE") {
            await this.stateMachine.transition(
              activeCase._id.toString(),
              "RESPONSE_RECEIVED",
              {
                actorId: null,
                actorType: "SYSTEM",
                correlationId: event.correlationId ?? undefined,
              },
              {
                eventType: "CASE_STATUS_CHANGED",
                expectedCurrent: ["AWAITING_RESPONSE"],
                expectedRevision: activeCase.revision,
                idempotencyKey: `response-received-status-${responseDocument._id.toString()}`,
                payload: {
                  responseId: responseDocument._id.toString(),
                  to: "RESPONSE_RECEIVED",
                },
              },
            );
          }
          if (this.deadlineService) {
            await this.deadlineService.recalculate(
              activeCase._id.toString(),
              "RESPONSE_DATE",
              response.receivedAt,
              event.correlationId,
            );
          }
          await this.scheduleResponseOperation(
            response,
            "analyze-response",
            event.correlationId,
            scheduled,
          );
        }
      }
    }

    if (event.type === "RESPONSE_ANALYZED") {
      const responseId = readPayloadString(event, "responseId");
      if (
        this.responseModel &&
        responseId &&
        Types.ObjectId.isValid(responseId)
      ) {
        const activeCase = await this.caseModel
          .findOne({ _id: event.caseId, deletedAt: null })
          .exec();
        const response = await this.responseModel
          .findOne({
            _id: new Types.ObjectId(responseId),
            caseId: event.caseId,
          })
          .exec();
        if (activeCase && response) {
          const responseDocument = response as CaseResponse & {
            _id: Types.ObjectId;
          };
          if (activeCase.status === "RESPONSE_RECEIVED") {
            await this.stateMachine.transition(
              activeCase._id.toString(),
              "REPLANNING",
              {
                actorId: null,
                actorType: "SYSTEM",
                correlationId: event.correlationId ?? undefined,
              },
              {
                eventType: "CASE_REPLANNING",
                expectedCurrent: ["RESPONSE_RECEIVED"],
                expectedRevision: activeCase.revision,
                idempotencyKey: `response-replanning-${responseDocument._id.toString()}`,
                payload: { responseId: responseDocument._id.toString() },
              },
            );
            await this.scheduleResponseOperation(
              response,
              "replan-case",
              event.correlationId,
              scheduled,
            );
          } else if (activeCase.status === "REPLANNING") {
            await this.scheduleResponseOperation(
              response,
              "replan-case",
              event.correlationId,
              scheduled,
            );
          }
        }
      }
    }

    if (event.type === "PROCEDURE_RESOLVED" && this.deadlineService) {
      const activeCase = await this.caseModel
        .findOne({ _id: event.caseId, deletedAt: null })
        .exec();
      if (activeCase) {
        if (activeCase.notificationDate) {
          await this.deadlineService.recalculate(
            activeCase._id.toString(),
            "NOTIFICATION_DATE",
            activeCase.notificationDate,
            event.correlationId,
          );
        }
        if (activeCase.decisionDate) {
          await this.deadlineService.recalculate(
            activeCase._id.toString(),
            "DECISION_DATE",
            activeCase.decisionDate,
            event.correlationId,
          );
        }
      }
    }

    await this.activityPubSub.publish({
      caseId: event.caseId.toString(),
      sequence: event.sequence,
    });
    await this.workflowDispatch.markCompleted(payload.dispatchId);

    return { eventType: event.type, scheduled };
  }

  private async scheduleCaseAnalysisIfReady(
    event: CaseEventDocument,
    scheduled: string[],
  ): Promise<void> {
    const [activeCase, readyEvidence] = await Promise.all([
      this.caseModel.findOne({ _id: event.caseId, deletedAt: null }).exec(),
      this.evidenceModel.exists({
        caseId: event.caseId,
        deletedAt: null,
        processingStatus: "READY",
      }),
    ]);
    if (
      !activeCase ||
      !readyEvidence ||
      ![
        "EVIDENCE_COLLECTION",
        "NEEDS_HUMAN",
        "READY_TO_APPEAL",
      ].includes(activeCase.status)
    ) {
      return;
    }

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
        expectedCurrent: [
          "EVIDENCE_COLLECTION",
          "NEEDS_HUMAN",
          "READY_TO_APPEAL",
        ],
        expectedRevision: activeCase.revision,
        idempotencyKey: `case-analysis-start-${activeCase._id.toString()}-${activeCase.revision}`,
        payload: {
          reason:
            activeCase.status === "EVIDENCE_COLLECTION"
              ? "INITIAL_EVIDENCE_READY"
              : "NEW_EVIDENCE_REQUIRES_REVIEW",
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
    scheduled.push(`ai-operations:analyze-case:${activeCase._id.toString()}`);
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

  private async scheduleResponseOperation(
    response: CaseResponse,
    operation: AIOperationJobPayload["operation"],
    correlationId: string | null,
    scheduled: string[],
  ): Promise<void> {
    if (operation !== "analyze-response" && operation !== "replan-case") return;
    const responseDocument = response as CaseResponse & { _id: Types.ObjectId };
    const caseId = response.caseId?.toString();
    if (!caseId) return;
    const inputHash = hashInput({
      caseId,
      responseId: responseDocument._id.toString(),
      responseRevision: response.revision,
    });
    await this.queueProducer.enqueueAIOperation({
      caseId,
      correlationId,
      evidenceId: null,
      expectedRevision: response.revision,
      idempotencyKey: `${operation}-${responseDocument._id.toString()}-${response.revision}-${inputHash}`,
      inputHash,
      operation,
      responseId: responseDocument._id.toString(),
      workflowVersion: WORKFLOW_VERSION,
    });
    scheduled.push(
      `ai-operations:${operation}:${responseDocument._id.toString()}`,
    );
  }
}

function readPayloadString(
  event: CaseEventDocument,
  key: string,
): string | null {
  const value = event.payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
