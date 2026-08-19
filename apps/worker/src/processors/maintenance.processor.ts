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
import { DeadlineService, EmailInboundService } from "api/email";
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
    private readonly inbound: EmailInboundService,
    private readonly deadlines: DeadlineService,
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
    const [publishedDispatches, expiredDeadlines] = await Promise.all([
      this.workflowDispatch.publishPending(),
      this.deadlines.expireDue(),
    ]);
    let inboundMessages = 0;
    try {
      inboundMessages = await this.inbound.pollGmail();
    } catch {
      // A mailbox outage is observable through the failed maintenance job;
      // it must not cause a false response or state transition.
      throw new Error("Gmail inbound polling failed.");
    }
    return { expiredDeadlines, inboundMessages, publishedDispatches };
  }

  onApplicationBootstrap(): void {
    this.worker.on("error", () => undefined);
    this.worker.concurrency =
      this.config.get("QUEUE_MAINTENANCE_CONCURRENCY") ?? 1;
  }
}
