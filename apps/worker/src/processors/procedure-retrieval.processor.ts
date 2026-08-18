import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { type Job } from "bullmq";

import {
  procedureRetrievalJobPayloadSchema,
  type ProcedureRetrievalJobPayload,
} from "@recourse/contracts";
import { type EnvironmentConfig } from "@recourse/config";
import { ProcedureResolutionError, ProcedureService } from "api/procedure";
import { WebRetrievalError } from "api/procedure";
import { NonRetryableQueueError, TransientQueueError } from "api/queues";
import { QueueNames } from "api/queue-constants";

@Injectable()
@Processor({ name: QueueNames.PROCEDURE_RETRIEVAL, configKey: "worker" })
export class ProcedureRetrievalProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly procedureService: ProcedureService,
  ) {
    super();
  }

  async process(job: Job<ProcedureRetrievalJobPayload>): Promise<unknown> {
    const parsed = procedureRetrievalJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new NonRetryableQueueError(
        "Procedure job payload is invalid.",
        "INVALID_JOB_PAYLOAD",
      );
    }
    try {
      return await this.procedureService.resolve(parsed.data);
    } catch (error: unknown) {
      if (error instanceof ProcedureResolutionError) {
        throw new NonRetryableQueueError(error.message, error.code);
      }
      if (error instanceof WebRetrievalError) {
        if (error.retryable)
          throw new TransientQueueError(error.message, error.code);
        throw new NonRetryableQueueError(error.message, error.code);
      }
      throw error;
    }
  }

  onApplicationBootstrap(): void {
    this.worker.on("error", () => undefined);
    this.worker.concurrency =
      this.config.get("QUEUE_PROCEDURE_CONCURRENCY") ?? 3;
  }
}
