import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { type Job } from "bullmq";
import { ConfigService } from "@nestjs/config";

import {
  caseEventJobPayloadSchema,
  type CaseEventJobPayload,
} from "@recourse/contracts";
import { type EnvironmentConfig } from "@recourse/config";

import { CaseOrchestratorService } from "api/queues";
import { QueueNames } from "api/queue-constants";
import { NonRetryableQueueError } from "api/queues";

@Injectable()
@Processor({ name: QueueNames.CASE_ORCHESTRATION, configKey: "worker" })
export class CaseOrchestrationProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly orchestrator: CaseOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<CaseEventJobPayload>): Promise<unknown> {
    const parsed = caseEventJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new NonRetryableQueueError(
        "Case orchestration payload is invalid.",
        "INVALID_JOB_PAYLOAD",
      );
    }
    const payload = parsed.data;
    return this.orchestrator.handleCaseEvent(payload);
  }

  onApplicationBootstrap(): void {
    this.worker.on("error", () => undefined);
    this.worker.concurrency = this.config.get("QUEUE_CASE_CONCURRENCY") ?? 5;
  }
}
