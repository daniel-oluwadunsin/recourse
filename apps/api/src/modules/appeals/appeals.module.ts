import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";

import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { Case, CaseSchema } from "../cases/schemas/case.schema";
import { CaseEvent, CaseEventSchema } from "../cases/schemas/case-event.schema";
import { CasesModule } from "../cases/cases.module";
import { EmailModule } from "../email/email.module";
import { Evidence, EvidenceSchema } from "../evidence/schemas/evidence.schema";
import {
  EvidenceBlock,
  EvidenceBlockSchema,
} from "../evidence/schemas/evidence-block.schema";
import { Claim, ClaimSchema } from "../intelligence/schemas/claim.schema";
import {
  Contradiction,
  ContradictionSchema,
} from "../intelligence/schemas/contradiction.schema";
import {
  EvidenceRequirementMatch,
  EvidenceRequirementMatchSchema,
} from "../intelligence/schemas/evidence-requirement-match.schema";
import {
  Procedure,
  ProcedureSchema,
} from "../procedure/schemas/procedure.schema";
import {
  ProcedureVersion,
  ProcedureVersionSchema,
} from "../procedure/schemas/procedure-version.schema";
import {
  ProceduralClaim,
  ProceduralClaimSchema,
} from "../procedure/schemas/procedural-claim.schema";
import {
  SourceSnapshot,
  SourceSnapshotSchema,
} from "../retrieval/schemas/source-snapshot.schema";
import { ActionService } from "./action.service";
import { ActionPolicyEngine } from "./action-policy.service";
import { AssistedPortalAdapter } from "./adapters/assisted-portal.adapter";
import { EmailActionAdapter } from "./adapters/email.adapter";
import { AppealsController } from "./appeals.controller";
import { AppealComposerService } from "./appeal-composer.service";
import { GroundingVerifierService } from "./grounding-verifier.service";
import { Appeal, AppealSchema } from "./schemas/appeal.schema";
import { CaseAction, CaseActionSchema } from "./schemas/case-action.schema";

@Module({
  controllers: [AppealsController],
  exports: [ActionService, AppealComposerService, ActionPolicyEngine],
  imports: [
    ConfigModule,
    AuthorizationModule,
    AuthModule,
    AuditModule,
    forwardRef(() => CasesModule),
    EmailModule,
    MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: CaseEvent.name, schema: CaseEventSchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: EvidenceBlock.name, schema: EvidenceBlockSchema },
      { name: Claim.name, schema: ClaimSchema },
      { name: Contradiction.name, schema: ContradictionSchema },
      {
        name: EvidenceRequirementMatch.name,
        schema: EvidenceRequirementMatchSchema,
      },
      { name: Procedure.name, schema: ProcedureSchema },
      { name: ProcedureVersion.name, schema: ProcedureVersionSchema },
      { name: ProceduralClaim.name, schema: ProceduralClaimSchema },
      { name: SourceSnapshot.name, schema: SourceSnapshotSchema },
      { name: Appeal.name, schema: AppealSchema },
      { name: CaseAction.name, schema: CaseActionSchema },
    ]),
  ],
  providers: [
    ActionPolicyEngine,
    ActionService,
    AssistedPortalAdapter,
    AppealComposerService,
    EmailActionAdapter,
    GroundingVerifierService,
  ],
})
export class AppealsModule {}
