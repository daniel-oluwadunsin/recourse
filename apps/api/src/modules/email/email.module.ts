import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";

import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { CasesModule } from "../cases/cases.module";
import { Case, CaseSchema } from "../cases/schemas/case.schema";
import { Deadline, DeadlineSchema } from "../cases/schemas/deadline.schema";
import { EvidenceModule } from "../evidence/evidence.module";
import {
  ProcedureVersion,
  ProcedureVersionSchema,
} from "../procedure/schemas/procedure-version.schema";
import {
  ProceduralClaim,
  ProceduralClaimSchema,
} from "../procedure/schemas/procedural-claim.schema";
import { QueuesModule } from "../queues/queues.module";
import { User, UserSchema } from "../users/schemas/user.schema";
import { CaseEmailTokenService } from "./case-email-token.service";
import { DeadlineService } from "./deadline.service";
import { DeadlinesController } from "./deadlines.controller";
import { EmailController } from "./email.controller";
import { EmailInboundService } from "./email-inbound.service";
import { EmailService } from "./email.service";
import { EMAIL_PROVIDER } from "./email.types";
import { GmailEmailProvider } from "./gmail.provider";
import { NotificationService } from "./notification.service";
import { NotificationsController } from "./notifications.controller";
import { ResponsesController } from "./responses.controller";
import {
  CaseResponse,
  CaseResponseSchema,
} from "./schemas/case-response.schema";
import {
  CaseEmailToken,
  CaseEmailTokenSchema,
} from "./schemas/case-email-token.schema";
import {
  InboundEmail,
  InboundEmailSchema,
} from "./schemas/inbound-email.schema";
import {
  Notification,
  NotificationSchema,
} from "./schemas/notification.schema";
import {
  OutboundEmail,
  OutboundEmailSchema,
} from "./schemas/outbound-email.schema";

@Module({
  controllers: [
    EmailController,
    ResponsesController,
    DeadlinesController,
    NotificationsController,
  ],
  exports: [
    CaseEmailTokenService,
    DeadlineService,
    EmailInboundService,
    EmailService,
    NotificationService,
    EMAIL_PROVIDER,
  ],
  imports: [
    ConfigModule,
    AuditModule,
    AuthModule,
    forwardRef(() => CasesModule),
    forwardRef(() => EvidenceModule),
    forwardRef(() => QueuesModule),
    MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: CaseEmailToken.name, schema: CaseEmailTokenSchema },
      { name: CaseResponse.name, schema: CaseResponseSchema },
      { name: Deadline.name, schema: DeadlineSchema },
      { name: InboundEmail.name, schema: InboundEmailSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: OutboundEmail.name, schema: OutboundEmailSchema },
      { name: ProcedureVersion.name, schema: ProcedureVersionSchema },
      { name: ProceduralClaim.name, schema: ProceduralClaimSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    GmailEmailProvider,
    { provide: EMAIL_PROVIDER, useExisting: GmailEmailProvider },
    CaseEmailTokenService,
    DeadlineService,
    EmailInboundService,
    EmailService,
    NotificationService,
  ],
})
export class EmailModule {}

export { EmailService } from "./email.service";
export { EmailInboundService } from "./email-inbound.service";
export { NotificationService } from "./notification.service";
export { DeadlineService } from "./deadline.service";
