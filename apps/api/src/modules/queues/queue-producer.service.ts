import { Injectable, OnApplicationShutdown, Optional } from "@nestjs/common";
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
  notificationJobPayloadSchema,
  type NotificationJobPayload,
  procedureRetrievalJobPayloadSchema,
  type ProcedureRetrievalJobPayload,
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
import { ApplicationObservabilityService } from "../../common/observability.service";

@Injectable()
export class QueueProducerService implements OnApplicationShutdown {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    @Optional()
    private readonly observability?: ApplicationObservabilityService,
  ) {}

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
    this.recordEnqueue(QUEUE_NAMES.CASE_ORCHESTRATION);
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
    this.recordEnqueue(QUEUE_NAMES.EVIDENCE_PROCESSING);
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
    this.recordEnqueue(QUEUE_NAMES.MAINTENANCE);
    return { duplicateSafe: true, jobId };
  }

  async enqueueProcedureRetrieval(
    payload: ProcedureRetrievalJobPayload,
  ): Promise<{ jobId: string; duplicateSafe: true }> {
    const parsed = procedureRetrievalJobPayloadSchema.parse(payload);
    const jobId = stableJobId(
      "procedure-resolve",
      parsed.caseId,
      parsed.expectedRevision.toString(),
      parsed.queryHash,
    );
    await this.queue(QUEUE_NAMES.PROCEDURE_RETRIEVAL).add(
      JOB_NAMES.PROCEDURE_RETRIEVE,
      parsed,
      { jobId },
    );
    this.recordEnqueue(QUEUE_NAMES.PROCEDURE_RETRIEVAL);
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
    this.recordEnqueue(QUEUE_NAMES.AI_OPERATIONS);
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
    this.recordEnqueue(queueName);
  }

  async enqueueNotification(
    payload: NotificationJobPayload,
    delay = 0,
  ): Promise<{ jobId: string; duplicateSafe: true }> {
    const parsed = notificationJobPayloadSchema.parse(payload);
    const jobId = stableJobId("notification", parsed.idempotencyKey);
    await this.queue(QUEUE_NAMES.NOTIFICATIONS).add(
      parsed.kind === "DEADLINE_REMINDER"
        ? JOB_NAMES.DEADLINE_REMINDER
        : JOB_NAMES.NOTIFICATION_SEND,
      parsed,
      { delay, jobId },
    );
    this.recordEnqueue(QUEUE_NAMES.NOTIFICATIONS);
    return { duplicateSafe: true, jobId };
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

  private recordEnqueue(queue: QueueName): void {
    this.observability?.metrics.increment(
      "recourse_queue_jobs_enqueued_total",
      {
        queue,
      },
    );
  }
}
