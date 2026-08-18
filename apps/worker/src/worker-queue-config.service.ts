import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { type Queue } from "bullmq";

import { type EnvironmentConfig } from "@recourse/config";

import { QueueNames } from "api/queue-constants";

@Injectable()
export class WorkerQueueConfigService implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QueueNames.PROCEDURE_RETRIEVAL)
    private readonly procedureQueue: Queue,
    @InjectQueue(QueueNames.AI_OPERATIONS)
    private readonly aiQueue: Queue,
    @InjectQueue(QueueNames.EXTERNAL_ACTIONS)
    private readonly externalActionsQueue: Queue,
    private readonly config: ConfigService<EnvironmentConfig>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.procedureQueue.on("error", () => undefined);
    this.aiQueue.on("error", () => undefined);
    this.externalActionsQueue.on("error", () => undefined);
    await Promise.all([
      this.procedureQueue.setGlobalRateLimit(
        this.config.get("QUEUE_PROCEDURE_RATE_LIMIT_MAX") ?? 30,
        this.config.get("QUEUE_PROCEDURE_RATE_LIMIT_DURATION_MS") ?? 60000,
      ),
      this.aiQueue.setGlobalRateLimit(
        this.config.get("QUEUE_AI_RATE_LIMIT_MAX") ?? 60,
        this.config.get("QUEUE_AI_RATE_LIMIT_DURATION_MS") ?? 60000,
      ),
      this.externalActionsQueue.setGlobalRateLimit(
        this.config.get("QUEUE_EXTERNAL_ACTION_RATE_LIMIT_MAX") ?? 5,
        this.config.get("QUEUE_EXTERNAL_ACTION_RATE_LIMIT_DURATION_MS") ??
          60000,
      ),
    ]);
  }
}
