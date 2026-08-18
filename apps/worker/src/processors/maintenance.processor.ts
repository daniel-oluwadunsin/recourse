import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { type Job } from "bullmq";
import { ConfigService } from "@nestjs/config";

import {
  maintenanceJobPayloadSchema,
  type MaintenanceJobPayload,
} from "@recourse/contracts";
import { type EnvironmentConfig } from "@recourse/config";

import { WorkflowDispatchService } from "api/queues";
import { QueueNames } from "api/queue-constants";
import { NonRetryableQueueError } from "api/queues";

@Injectable()
@Processor({ name: QueueNames.MAINTENANCE, configKey: "worker" })
export class MaintenanceProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly workflowDispatch: WorkflowDispatchService,
  ) {
    super();
  }

  async process(job: Job<MaintenanceJobPayload>): Promise<unknown> {
    const parsed = maintenanceJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new NonRetryableQueueError(
        "Maintenance payload is invalid.",
        "INVALID_JOB_PAYLOAD",
      );
    }
    return {
      publishedDispatches: await this.workflowDispatch.publishPending(),
    };
  }

  onApplicationBootstrap(): void {
    this.worker.on("error", () => undefined);
    this.worker.concurrency =
      this.config.get("QUEUE_MAINTENANCE_CONCURRENCY") ?? 1;
  }
}
