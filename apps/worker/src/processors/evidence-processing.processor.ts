import {
  ConflictException,
  Injectable,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { type Job } from "bullmq";
import { ConfigService } from "@nestjs/config";

import {
  evidenceProcessingJobPayloadSchema,
  type EvidenceProcessingJobPayload,
} from "@recourse/contracts";
import { type EnvironmentConfig } from "@recourse/config";

import {
  EvidenceDeletedError,
  EvidenceService,
  ExtractionFailure,
  StorageProviderError,
} from "api/worker-domain";
import { QueueNames } from "api/queue-constants";
import { NonRetryableQueueError, TransientQueueError } from "api/queues";

@Injectable()
@Processor({ name: QueueNames.EVIDENCE_PROCESSING, configKey: "worker" })
export class EvidenceProcessingProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly evidenceService: EvidenceService,
  ) {
    super();
  }

  async process(job: Job<EvidenceProcessingJobPayload>): Promise<unknown> {
    const parsed = evidenceProcessingJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new NonRetryableQueueError(
        "Evidence processing payload is invalid.",
        "INVALID_JOB_PAYLOAD",
      );
    }
    const payload = parsed.data;
    try {
      return await this.evidenceService.process(
        payload.evidenceId,
        payload.expectedRevision,
        {
          actorId: null,
          actorType: "SYSTEM",
          correlationId: payload.correlationId ?? undefined,
        },
      );
    } catch (error: unknown) {
      if (error instanceof EvidenceDeletedError) {
        return { status: "skipped-deleted" };
      }
      if (error instanceof ExtractionFailure) {
        throw new NonRetryableQueueError(error.message, error.code);
      }
      if (error instanceof StorageProviderError) {
        if (error.code === "NOT_FOUND" || error.code === "INVALID_KEY") {
          throw new NonRetryableQueueError(error.message, error.code);
        }
        throw new TransientQueueError(error.message, error.code);
      }
      if (error instanceof ConflictException) {
        throw new NonRetryableQueueError(
          error.message,
          "STALE_EVIDENCE_REVISION",
        );
      }
      throw error;
    }
  }

  onApplicationBootstrap(): void {
    this.worker.on("error", () => undefined);
    this.worker.concurrency =
      this.config.get("QUEUE_EVIDENCE_CONCURRENCY") ?? 3;
  }
}
