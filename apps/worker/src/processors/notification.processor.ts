import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { type Job } from "bullmq";
import { ConfigService } from "@nestjs/config";

import {
  notificationJobPayloadSchema,
  type NotificationJobPayload,
} from "@recourse/contracts";
import { type EnvironmentConfig } from "@recourse/config";

import { EmailService, NotificationService } from "api/email";
import { NonRetryableQueueError } from "api/queues";
import { QueueNames } from "api/queue-constants";

@Injectable()
@Processor({ name: QueueNames.NOTIFICATIONS, configKey: "worker" })
export class NotificationProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly email: EmailService,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>): Promise<unknown> {
    const parsed = notificationJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new NonRetryableQueueError(
        "Notification payload is invalid.",
        "INVALID_JOB_PAYLOAD",
      );
    }
    if (parsed.data.kind === "OUTBOUND_EMAIL") {
      if (!parsed.data.outboundEmailId) {
        throw new NonRetryableQueueError(
          "Outbound email identifier is missing.",
          "INVALID_EMAIL_JOB",
        );
      }
      return this.email.deliver(parsed.data.outboundEmailId);
    }
    if (!parsed.data.deadlineId) {
      throw new NonRetryableQueueError(
        "Deadline identifier is missing.",
        "INVALID_DEADLINE_JOB",
      );
    }
    return this.notifications.createDeadlineReminder(parsed.data.deadlineId);
  }

  onApplicationBootstrap(): void {
    this.worker.on("error", () => undefined);
    this.worker.concurrency =
      this.config.get("QUEUE_NOTIFICATION_CONCURRENCY") ?? 10;
  }
}
