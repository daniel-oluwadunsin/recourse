import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { type EnvironmentConfig, parseEnvironment } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { QueuesModule } from "api/queues";
import { queueNames } from "api/queue-constants";
import { queueOptions } from "api/redis-options";
import { WorkerDomainModule } from "api/worker-domain";
import { CaseOrchestrationProcessor } from "./processors/case-orchestration.processor";
import { EvidenceProcessingProcessor } from "./processors/evidence-processing.processor";
import { MaintenanceProcessor } from "./processors/maintenance.processor";
import { QueueFailureObserver } from "./queue-failure-observer.service";
import { WorkerHeartbeatService } from "./worker-heartbeat.service";
import { WorkerQueueConfigService } from "./worker-queue-config.service";
import { AIModule } from "api/ai";
import { AIOperationsProcessor } from "./processors/ai-operations.processor";
import { ProcedureRetrievalProcessor } from "./processors/procedure-retrieval.processor";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => parseEnvironment(config),
    }),
    BullModule.forRootAsync("worker", {
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentConfig>) => ({
        ...queueOptions(config, "worker"),
      }),
    }),
    BullModule.registerQueue(
      ...queueNames.map((name) => ({ name, configKey: "worker" })),
    ),
    QueuesModule,
    WorkerDomainModule,
    AIModule,
  ],
  providers: [
    {
      provide: RecourseLogger,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentConfig>) =>
        new RecourseLogger({
          service: "recourse-worker",
          environment: config.get("APP_ENV") ?? "local",
          level: config.get("LOG_LEVEL") ?? "info",
        }),
    },
    CaseOrchestrationProcessor,
    EvidenceProcessingProcessor,
    MaintenanceProcessor,
    AIOperationsProcessor,
    ProcedureRetrievalProcessor,
    QueueFailureObserver,
    WorkerHeartbeatService,
    WorkerQueueConfigService,
  ],
})
export class AppModule {}
