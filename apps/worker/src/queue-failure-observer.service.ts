import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, QueueEvents } from "bullmq";

import { type QueueName, type QueueRetryCategory } from "@recourse/contracts";
import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { JobFailureService } from "api/queues";
import { QueueNames } from "api/queue-constants";
import { redisConnectionOptions } from "api/redis-options";

@Injectable()
export class QueueFailureObserver
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly events: QueueEvents[] = [];
  private readonly queues: Queue[] = [];

  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly failures: JobFailureService,
    private readonly logger: RecourseLogger,
  ) {}

  onModuleInit(): void {
    for (const queue of Object.values(QueueNames)) {
      const name = queue as QueueName;
      const options = {
        connection: redisConnectionOptions(this.config, "worker"),
        prefix: this.config.get("REDIS_PREFIX") ?? "recourse:local:",
      };
      const queueEvents = new QueueEvents(name, options);
      const queueClient = new Queue(name, options);
      queueEvents.on("failed", ({ jobId, failedReason }) => {
        void this.recordFailure(name, queueClient, jobId, failedReason);
      });
      queueEvents.on("error", (error) => {
        this.logger.warn(
          `Queue ${name} events error: ${safeMessage(error)}`,
          "QueueFailureObserver",
        );
      });
      this.events.push(queueEvents);
      this.queues.push(queueClient);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([
      ...this.events.map((events) => events.close()),
      ...this.queues.map((queue) => queue.close()),
    ]);
  }

  private async recordFailure(
    queue: QueueName,
    queueClient: Queue,
    jobId: string,
    failedReason: string,
  ): Promise<void> {
    try {
      const job = await queueClient.getJob(jobId);
      const data = isRecord(job?.data) ? job.data : undefined;
      await this.failures.record({
        attemptsMade: job?.attemptsMade ?? 0,
        caseId: stringOrNull(data?.caseId),
        category: categoryFromFailure(failedReason),
        code: errorCodeFromReason(failedReason),
        correlationId: stringOrNull(data?.correlationId),
        evidenceId: stringOrNull(data?.evidenceId),
        jobId,
        jobName: job?.name ?? "unknown",
        message: safeMessage(failedReason),
        queue,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not persist failure metadata: ${safeMessage(error)}`,
        "QueueFailureObserver",
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value.slice(0, 200) : null;
}

function categoryFromFailure(reason: string): QueueRetryCategory {
  if (reason.includes("INVALID_") || reason.includes("STALE_")) {
    return "INVALID_INPUT";
  }
  if (reason.includes("TRANSIENT_")) {
    return "TRANSIENT";
  }
  if (reason.includes("RATE_LIMIT")) {
    return "RATE_LIMITED";
  }
  if (reason.includes("UNSUPPORTED")) {
    return "UNSUPPORTED";
  }
  return "UNKNOWN";
}

function errorCodeFromReason(reason: string): string {
  const match = /^\[([A-Z0-9_-]+)\]/.exec(reason);
  return match?.[1] ?? "JOB_FAILED";
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 500);
}
