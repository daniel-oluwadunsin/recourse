import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
import { Evidence, EvidenceSchema } from "../evidence/schemas/evidence.schema";
import {
  EvidenceBlock,
  EvidenceBlockSchema,
} from "../evidence/schemas/evidence-block.schema";
import { CaseEventService } from "./case-events.service";
import { CasesController } from "./cases.controller";
import { CasesService } from "./cases.service";
import { CaseStateMachineService } from "./case-state-machine.service";
import { CaseEvent, CaseEventSchema } from "./schemas/case-event.schema";
import { Case, CaseSchema } from "./schemas/case.schema";
import { Deadline, DeadlineSchema } from "./schemas/deadline.schema";
import { Decision, DecisionSchema } from "./schemas/decision.schema";
import { Institution, InstitutionSchema } from "./schemas/institution.schema";
import { InstitutionLookupService } from "./institutions.service";

@Module({
  controllers: [CasesController],
  exports: [
    CaseEventService,
    CasesService,
    CaseStateMachineService,
    InstitutionLookupService,
  ],
  imports: [
    AuthorizationModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: Decision.name, schema: DecisionSchema },
      { name: CaseEvent.name, schema: CaseEventSchema },
      { name: Institution.name, schema: InstitutionSchema },
      { name: Deadline.name, schema: DeadlineSchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: EvidenceBlock.name, schema: EvidenceBlockSchema },
    ]),
    StorageModule,
  ],
  providers: [
    CaseEventService,
    CasesService,
    CaseStateMachineService,
    InstitutionLookupService,
  ],
})
export class CasesModule {}
