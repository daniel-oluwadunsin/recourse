import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { UnrecoverableError } from "bullmq";
import { type Model, Types } from "mongoose";

import {
  type CaseEventJobPayload,
  type EvidenceProcessingJobPayload,
} from "@recourse/contracts";

import { ActivityPubSubService } from "./activity-pubsub.service";
import { QUEUE_NAMES, WORKFLOW_VERSION } from "./queue.constants";
import { QueueProducerService } from "./queue-producer.service";
import { WorkflowDispatchService } from "./workflow-dispatch.service";
import {
  CaseEvent,
  type CaseEventDocument,
} from "../cases/schemas/case-event.schema";
import { Case } from "../cases/schemas/case.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";

@Injectable()
export class CaseOrchestratorService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(CaseEvent.name)
    private readonly caseEventModel: Model<CaseEvent>,
    @InjectModel(Evidence.name)
    private readonly evidenceModel: Model<Evidence>,
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

    await this.activityPubSub.publish({
      caseId: event.caseId.toString(),
      sequence: event.sequence,
    });
    await this.workflowDispatch.markCompleted(payload.dispatchId);

    return { eventType: event.type, scheduled };
  }
}

function readPayloadString(
  event: CaseEventDocument,
  key: string,
): string | null {
  const value = event.payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
