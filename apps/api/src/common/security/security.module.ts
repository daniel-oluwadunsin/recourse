import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { MalwareScanService } from "./malware-scan.service";
import { UsageBudgetService } from "./usage-budget.service";

@Global()
@Module({
  exports: [MalwareScanService, UsageBudgetService],
  imports: [ConfigModule],
  providers: [MalwareScanService, UsageBudgetService],
})
export class SecurityModule {}
