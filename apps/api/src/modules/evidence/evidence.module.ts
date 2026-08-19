import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { AuthModule } from "../auth/auth.module";
import { CasesModule } from "../cases/cases.module";
import { Case, CaseSchema } from "../cases/schemas/case.schema";
import { StorageModule } from "../storage/storage.module";
import { DocumentExtractionService } from "./document-extraction.service";
import { EvidenceController } from "./evidence.controller";
import { EvidenceService } from "./evidence.service";
import { EvidenceStateMachineService } from "./evidence-state-machine.service";
import { FilePolicyService } from "./file-policy.service";
import { Evidence, EvidenceSchema } from "./schemas/evidence.schema";
import {
  EvidenceBlock,
  EvidenceBlockSchema,
} from "./schemas/evidence-block.schema";

@Module({
  controllers: [EvidenceController],
  exports: [
    DocumentExtractionService,
    EvidenceService,
    EvidenceStateMachineService,
  ],
  imports: [
    AuthorizationModule,
    AuthModule,
    forwardRef(() => CasesModule),
    MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: EvidenceBlock.name, schema: EvidenceBlockSchema },
    ]),
    StorageModule,
  ],
  providers: [
    DocumentExtractionService,
    EvidenceService,
    EvidenceStateMachineService,
    FilePolicyService,
  ],
})
export class EvidenceModule {}
