import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { QueuesModule } from "../queues/queues.module";
import { AdminController } from "./admin.controller";

@Module({
  controllers: [AdminController],
  imports: [AuditModule, AuthModule, QueuesModule],
})
export class AdminModule {}
