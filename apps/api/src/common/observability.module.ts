import { Global, Module } from "@nestjs/common";

import { ApplicationObservabilityService } from "./observability.service";

@Global()
@Module({
  exports: [ApplicationObservabilityService],
  providers: [ApplicationObservabilityService],
})
export class ObservabilityModule {}
