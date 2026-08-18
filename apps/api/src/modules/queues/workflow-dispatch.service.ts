import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { type ClientSession, type Model, type Types } from "mongoose";

import { type CaseEventDocument } from "../cases/schemas/case-event.schema";
import { type CaseEventJobPayload } from "@recourse/contracts";
import {
  JOB_NAMES,
  QUEUE_NAMES,
  WORKFLOW_VERSION,
  stableJobId,
} from "./queue.constants";
import {
  WorkflowDispatch,
  WorkflowDispatchStatus,
  type WorkflowDispatchDocument,
} from "./schemas/workflow-dispatch.schema";
import { QueueProducerService } from "./queue-producer.service";

const DISPATCH_LEASE_MS = 120_000;

@Injectable()
export class WorkflowDispatchService {
  constructor(
    @InjectModel(WorkflowDispatch.name)
    private readonly dispatchModel: Model<WorkflowDispatch>,
    private readonly queueProducer: QueueProducerService,
  ) {}

  async recordCaseEvent(
    event: CaseEventDocument,
    session: ClientSession,
  ): Promise<WorkflowDispatchDocument> {
    const eventId = event._id as Types.ObjectId;
    const jobId = stableJobId("case-event", eventId.toString());
    const [created] = await this.dispatchModel.create(
      [
        {
          caseId: event.caseId,
          eventId,
          eventSequence: event.sequence,
          eventType: event.type,
          idempotencyKey: `case-event-${eventId.toString()}`,
          jobId,
          jobName: JOB_NAMES.CASE_EVENT,
          lastError: null,
          leaseUntil: null,
          queueName: QUEUE_NAMES.CASE_ORCHESTRATION,
          status: WorkflowDispatchStatus.PENDING,
        },
      ],
      { session },
    );

    if (!created) {
      throw new Error("Workflow dispatch creation returned no document.");
    }

    return created;
  }

  async publishPending(limit = 50): Promise<number> {
    const now = new Date();
    await this.dispatchModel.updateMany(
      {
        leaseUntil: { $lt: now },
        status: WorkflowDispatchStatus.ENQUEUED,
      },
      {
        $set: {
          lastError: "Dispatch lease expired before completion.",
          status: WorkflowDispatchStatus.PENDING,
        },
      },
    );

    const pending = await this.dispatchModel
      .find({ status: WorkflowDispatchStatus.PENDING })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();

    let published = 0;
    for (const dispatch of pending) {
      try {
        const payload: CaseEventJobPayload = {
          caseId: dispatch.caseId.toString(),
          correlationId: null,
          dispatchId: dispatch._id.toString(),
          eventId: dispatch.eventId.toString(),
          eventSequence: dispatch.eventSequence,
          idempotencyKey: dispatch.idempotencyKey,
          workflowVersion: WORKFLOW_VERSION,
        };
        await this.queueProducer.enqueueCaseEvent(payload);
        await this.dispatchModel.updateOne(
          { _id: dispatch._id, status: WorkflowDispatchStatus.PENDING },
          {
            $inc: { attempts: 1 },
            $set: {
              lastError: null,
              leaseUntil: new Date(Date.now() + DISPATCH_LEASE_MS),
              status: WorkflowDispatchStatus.ENQUEUED,
            },
          },
        );
        published += 1;
      } catch (error: unknown) {
        await this.dispatchModel.updateOne(
          { _id: dispatch._id, status: WorkflowDispatchStatus.PENDING },
          {
            $set: {
              lastError: safeErrorMessage(error),
            },
          },
        );
      }
    }

    return published;
  }

  async markCompleted(dispatchId: string): Promise<void> {
    await this.dispatchModel.updateOne(
      { _id: dispatchId },
      {
        $set: {
          lastError: null,
          leaseUntil: null,
          status: WorkflowDispatchStatus.COMPLETED,
        },
      },
    );
  }

  async markFailed(dispatchId: string, error: unknown): Promise<void> {
    await this.dispatchModel.updateOne(
      { _id: dispatchId },
      {
        $set: {
          lastError: safeErrorMessage(error),
          leaseUntil: null,
          status: WorkflowDispatchStatus.FAILED,
        },
      },
    );
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 500);
}
