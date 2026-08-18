import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { ActivityPubSubService } from "./activity-pubsub.service";
import { CaseOrchestratorService } from "./case-orchestrator.service";
import { JobFailureService } from "./job-failure.service";
import { QUEUE_NAMES } from "./queue.constants";
import { QueueHealthService } from "./queue-health.service";
import { QueueProducerService } from "./queue-producer.service";
import { QueueRuntimeBootstrapService } from "./queue-runtime-bootstrap.service";
import { WorkflowDispatchService } from "./workflow-dispatch.service";
import {
  WorkflowDispatch,
  WorkflowDispatchSchema,
} from "./schemas/workflow-dispatch.schema";
import { Case, CaseSchema } from "../cases/schemas/case.schema";
import { CaseEvent, CaseEventSchema } from "../cases/schemas/case-event.schema";
import { Evidence, EvidenceSchema } from "../evidence/schemas/evidence.schema";
import { Decision, DecisionSchema } from "../cases/schemas/decision.schema";
import { JobFailure, JobFailureSchema } from "./schemas/job-failure.schema";
import { CasesModule } from "../cases/cases.module";

@Module({
  exports: [
    ActivityPubSubService,
    QueueHealthService,
    CaseOrchestratorService,
    QueueProducerService,
    WorkflowDispatchService,
    JobFailureService,
  ],
  imports: [
    ConfigModule,
    forwardRef(() => CasesModule),
    MongooseModule.forFeature([
      { name: WorkflowDispatch.name, schema: WorkflowDispatchSchema },
      { name: Case.name, schema: CaseSchema },
      { name: CaseEvent.name, schema: CaseEventSchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: Decision.name, schema: DecisionSchema },
      { name: JobFailure.name, schema: JobFailureSchema },
    ]),
  ],
  providers: [
    {
      provide: RecourseLogger,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentConfig>) =>
        new RecourseLogger({
          environment: config.get("APP_ENV") ?? "local",
          level: config.get("LOG_LEVEL") ?? "info",
          service: "recourse-queues",
        }),
    },
    ActivityPubSubService,
    CaseOrchestratorService,
    QueueHealthService,
    QueueProducerService,
    QueueRuntimeBootstrapService,
    WorkflowDispatchService,
    JobFailureService,
  ],
})
export class QueuesModule {
  static readonly maintenanceQueueName = QUEUE_NAMES.MAINTENANCE;
}

export { ActivityPubSubService } from "./activity-pubsub.service";
export { CaseOrchestratorService } from "./case-orchestrator.service";
export { QueueProducerService } from "./queue-producer.service";
export { WorkflowDispatchService } from "./workflow-dispatch.service";
export { JobFailureService } from "./job-failure.service";
export { NonRetryableQueueError, TransientQueueError } from "./queue-errors";
