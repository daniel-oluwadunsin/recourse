import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { AuditLog, AuditLogSchema } from "./schemas/audit-log.schema";
import { AuditLogService } from "./audit.service";

@Module({
  exports: [AuditLogService],
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [AuditLogService],
})
export class AuditModule {}
