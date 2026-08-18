import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { QueuesModule } from "../queues/queues.module";

@Module({
  controllers: [HealthController],
  imports: [QueuesModule],
})
export class HealthModule {}
