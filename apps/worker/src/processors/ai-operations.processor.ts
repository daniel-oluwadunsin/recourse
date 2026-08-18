import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { type Job } from "bullmq";

import {
  aiOperationJobPayloadSchema,
  type AIOperationJobPayload,
} from "@recourse/contracts";
import { type EnvironmentConfig } from "@recourse/config";

import {
  AIJobDomainError,
  AIJobService,
  AIProviderError,
  GroqProvider,
} from "api/ai";
import { NonRetryableQueueError, TransientQueueError } from "api/queues";
import { QueueNames } from "api/queue-constants";

@Injectable()
@Processor({ name: QueueNames.AI_OPERATIONS, configKey: "worker" })
export class AIOperationsProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly jobs: AIJobService,
    private readonly provider: GroqProvider,
  ) {
    super();
  }

  async process(job: Job<AIOperationJobPayload>): Promise<unknown> {
    const parsed = aiOperationJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new NonRetryableQueueError(
        "AI operation payload is invalid.",
        "INVALID_JOB_PAYLOAD",
      );
    }

    try {
      return await this.jobs.process(parsed.data);
    } catch (error: unknown) {
      if (error instanceof AIJobDomainError) {
        throw new NonRetryableQueueError(error.message, error.code);
      }
      if (error instanceof AIProviderError) {
        if (error.retryable) {
          throw new TransientQueueError(error.message, error.code);
        }
        throw new NonRetryableQueueError(error.message, error.code);
      }
      throw error;
    }
  }

  onApplicationBootstrap(): void {
    this.worker.on("error", () => undefined);
    this.worker.concurrency = this.config.get("QUEUE_AI_CONCURRENCY") ?? 5;
  }
}
