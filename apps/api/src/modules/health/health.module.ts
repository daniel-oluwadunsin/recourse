import { Module } from "@nestjs/common";

import { ObservabilityModule } from "../../common/observability.module";
import { HealthController } from "./health.controller";
import { QueuesModule } from "../queues/queues.module";

@Module({
  controllers: [HealthController],
  imports: [QueuesModule, ObservabilityModule],
})
export class HealthModule {}
