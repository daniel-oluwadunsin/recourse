import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";

import { CasesModule } from "../cases/cases.module";
import { AuthModule } from "../auth/auth.module";
import { Case, CaseSchema } from "../cases/schemas/case.schema";
import { CaseEvent, CaseEventSchema } from "../cases/schemas/case-event.schema";
import { Decision, DecisionSchema } from "../cases/schemas/decision.schema";
import {
  Institution,
  InstitutionSchema,
} from "../cases/schemas/institution.schema";
import { AIModule } from "../ai/ai.module";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import {
  RetrievalRun,
  RetrievalRunSchema,
} from "../retrieval/schemas/retrieval-run.schema";
import {
  SourceSnapshot,
  SourceSnapshotSchema,
} from "../retrieval/schemas/source-snapshot.schema";
import { TavilyProvider } from "../retrieval/tavily.provider";
import { AuthorityRankingService } from "../retrieval/authority-ranking.service";
import { ProcedureController } from "./procedure.controller";
import { ProcedureService } from "./procedure.service";
import { ProcedureQueryBuilderService } from "./procedure-query-builder.service";
import { ProcedureConfidenceService } from "./procedure-confidence.service";
import { Procedure, ProcedureSchema } from "./schemas/procedure.schema";
import {
  ProcedureVersion,
  ProcedureVersionSchema,
} from "./schemas/procedure-version.schema";
import {
  ProceduralClaim,
  ProceduralClaimSchema,
} from "./schemas/procedural-claim.schema";
import {
  ProcedureSourceChunk,
  ProcedureSourceChunkSchema,
} from "./schemas/procedure-source-chunk.schema";

@Module({
  controllers: [ProcedureController],
  imports: [
    ConfigModule,
    forwardRef(() => CasesModule),
    AuthModule,
    AIModule,
    EmbeddingsModule,
    MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: CaseEvent.name, schema: CaseEventSchema },
      { name: Decision.name, schema: DecisionSchema },
      { name: Institution.name, schema: InstitutionSchema },
      { name: RetrievalRun.name, schema: RetrievalRunSchema },
      { name: SourceSnapshot.name, schema: SourceSnapshotSchema },
      { name: Procedure.name, schema: ProcedureSchema },
      { name: ProcedureVersion.name, schema: ProcedureVersionSchema },
      { name: ProceduralClaim.name, schema: ProceduralClaimSchema },
      { name: ProcedureSourceChunk.name, schema: ProcedureSourceChunkSchema },
    ]),
  ],
  providers: [
    ProcedureService,
    ProcedureQueryBuilderService,
    ProcedureConfidenceService,
    AuthorityRankingService,
    TavilyProvider,
  ],
  exports: [ProcedureService, ProcedureQueryBuilderService, TavilyProvider],
})
export class ProcedureModule {}

export {
  ProcedureService,
  ProcedureResolutionError,
} from "./procedure.service";
export { ProcedureQueryBuilderService } from "./procedure-query-builder.service";
export {
  TavilyProvider,
  WebRetrievalError,
} from "../retrieval/tavily.provider";
