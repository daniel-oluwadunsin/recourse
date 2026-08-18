import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";

import {
  aiOperationJobPayloadSchema,
  type AIOperationJobPayload,
  caseEventJobPayloadSchema,
  type CaseEventJobPayload,
  evidenceProcessingJobPayloadSchema,
  type EvidenceProcessingJobPayload,
  maintenanceJobPayloadSchema,
  type MaintenanceJobPayload,
  type QueueJobPayload,
  type QueueName,
} from "@recourse/contracts";

import {
  JOB_NAMES,
  QUEUE_NAMES,
  WORKFLOW_VERSION,
  stableJobId,
} from "./queue.constants";
import { queueOptions } from "./redis-options";
import { type EnvironmentConfig } from "@recourse/config";

@Injectable()
export class QueueProducerService implements OnApplicationShutdown {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly config: ConfigService<EnvironmentConfig>) {}

  async enqueueCaseEvent(
    payload: CaseEventJobPayload,
  ): Promise<{ jobId: string; duplicateSafe: true }> {
    const parsed = caseEventJobPayloadSchema.parse(payload);
    const jobId = stableJobId("case-event", parsed.eventId);
    await this.queue(QUEUE_NAMES.CASE_ORCHESTRATION).add(
      JOB_NAMES.CASE_EVENT,
      parsed,
      {
        jobId,
      },
    );
    return { duplicateSafe: true, jobId };
  }

  async enqueueEvidenceProcessing(
    payload: EvidenceProcessingJobPayload,
  ): Promise<{ jobId: string; duplicateSafe: true }> {
    const parsed = evidenceProcessingJobPayloadSchema.parse(payload);
    const jobId = stableJobId(
      "evidence-process",
      parsed.evidenceId,
      parsed.sha256,
    );
    await this.queue(QUEUE_NAMES.EVIDENCE_PROCESSING).add(
      JOB_NAMES.EVIDENCE_PROCESS,
      parsed,
      { jobId },
    );
    return { duplicateSafe: true, jobId };
  }

  async enqueueMaintenance(
    payload: MaintenanceJobPayload,
  ): Promise<{ jobId: string; duplicateSafe: true }> {
    const parsed = maintenanceJobPayloadSchema.parse(payload);
    const jobId = stableJobId("maintenance", parsed.idempotencyKey);
    await this.queue(QUEUE_NAMES.MAINTENANCE).add(
      JOB_NAMES.MAINTENANCE_RECONCILE_DISPATCHES,
      parsed,
      { jobId },
    );
    return { duplicateSafe: true, jobId };
  }

  async enqueueAIOperation(
    payload: AIOperationJobPayload,
  ): Promise<{ jobId: string; duplicateSafe: true }> {
    const parsed = aiOperationJobPayloadSchema.parse(payload);
    const jobId = stableJobId(
      "ai-operation",
      parsed.operation,
      parsed.caseId ?? "no-case",
      parsed.evidenceId ?? "no-evidence",
      parsed.inputHash,
    );
    await this.queue(QUEUE_NAMES.AI_OPERATIONS).add(
      JOB_NAMES.AI_OPERATION,
      parsed,
      { jobId },
    );
    return { duplicateSafe: true, jobId };
  }

  async enqueueGeneric(
    queueName:
      | typeof QUEUE_NAMES.AI_OPERATIONS
      | typeof QUEUE_NAMES.EXTERNAL_ACTIONS
      | typeof QUEUE_NAMES.NOTIFICATIONS
      | typeof QUEUE_NAMES.PROCEDURE_RETRIEVAL,
    jobName: string,
    payload: QueueJobPayload,
    jobId: string,
  ): Promise<void> {
    const parsed = {
      ...payload,
      idempotencyKey: payload.idempotencyKey.trim(),
    } satisfies QueueJobPayload;

    await this.queue(queueName).add(jobName, parsed, {
      jobId: stableJobId(jobId),
    });
  }

  async ensureMaintenanceScheduler(): Promise<void> {
    await this.queue(QUEUE_NAMES.MAINTENANCE).upsertJobScheduler(
      "maintenance-reconcile-dispatches",
      {
        every: this.config.get("QUEUE_DISPATCH_INTERVAL_MS") ?? 5000,
      },
      {
        data: {
          correlationId: null,
          idempotencyKey: "maintenance-reconcile-dispatches",
          requestedAt: new Date(),
          workflowVersion: WORKFLOW_VERSION,
        },
        name: JOB_NAMES.MAINTENANCE_RECONCILE_DISPATCHES,
        opts: {
          attempts: 1,
          removeOnComplete: { count: 10 },
          removeOnFail: { count: 100 },
        },
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(
      [...this.queues.values()].map((queue) => queue.close()),
    );
  }

  private queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, queueOptions(this.config, "producer"));
      // BullMQ reports connection failures through the queue EventEmitter. A
      // listener keeps an unavailable optional Redis dependency from becoming
      // an uncaught process-level error during API startup.
      queue.on("error", () => undefined);
      this.queues.set(name, queue);
    }
    return queue;
  }
}
