import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";

import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { AuthModule } from "../auth/auth.module";
import { AIModule } from "../ai/ai.module";
import { CasesModule } from "../cases/cases.module";
import { Case, CaseSchema } from "../cases/schemas/case.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";
import { EvidenceSchema } from "../evidence/schemas/evidence.schema";
import { EvidenceModule } from "../evidence/evidence.module";
import {
  EvidenceBlock,
  EvidenceBlockSchema,
} from "../evidence/schemas/evidence-block.schema";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { StorageModule } from "../storage/storage.module";
import { Procedure } from "../procedure/schemas/procedure.schema";
import { ProcedureSchema } from "../procedure/schemas/procedure.schema";
import {
  ProcedureVersion,
  ProcedureVersionSchema,
} from "../procedure/schemas/procedure-version.schema";
import {
  ProceduralClaim,
  ProceduralClaimSchema,
} from "../procedure/schemas/procedural-claim.schema";
import {
  ProcedureSourceChunk,
  ProcedureSourceChunkSchema,
} from "../procedure/schemas/procedure-source-chunk.schema";
import { Claim, ClaimSchema } from "./schemas/claim.schema";
import {
  Contradiction,
  ContradictionSchema,
} from "./schemas/contradiction.schema";
import {
  EvidenceRequirementMatch,
  EvidenceRequirementMatchSchema,
} from "./schemas/evidence-requirement-match.schema";
import { GraphEdge, GraphEdgeSchema } from "./schemas/graph-edge.schema";
import { GraphNode, GraphNodeSchema } from "./schemas/graph-node.schema";
import {
  TimelineEvent,
  TimelineEventSchema,
} from "./schemas/timeline-event.schema";
import { CaseIntelligenceService } from "./case-intelligence.service";
import { ClaimService } from "./claim.service";
import { ContradictionService } from "./contradiction.service";
import { EmbeddingIndexService } from "./embedding-index.service";
import { GraphService } from "./graph.service";
import { HybridRetrievalService } from "./hybrid-retrieval.service";
import { IntelligenceController } from "./intelligence.controller";
import { ReadinessService } from "./readiness.service";
import { RequirementService } from "./requirement.service";
import { TimelineService } from "./timeline.service";
import { QueuesModule } from "../queues/queues.module";

@Module({
  controllers: [IntelligenceController],
  exports: [
    CaseIntelligenceService,
    ClaimService,
    GraphService,
    HybridRetrievalService,
    ReadinessService,
  ],
  imports: [
    AuthorizationModule,
    AuthModule,
    ConfigModule,
    forwardRef(() => AIModule),
    CasesModule,
    EmbeddingsModule,
    EvidenceModule,
    StorageModule,
    MongooseModule.forFeature([
      { name: Case.name, schema: CaseSchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: EvidenceBlock.name, schema: EvidenceBlockSchema },
      { name: Procedure.name, schema: ProcedureSchema },
      { name: ProcedureVersion.name, schema: ProcedureVersionSchema },
      { name: ProceduralClaim.name, schema: ProceduralClaimSchema },
      { name: ProcedureSourceChunk.name, schema: ProcedureSourceChunkSchema },
      { name: Claim.name, schema: ClaimSchema },
      { name: TimelineEvent.name, schema: TimelineEventSchema },
      { name: Contradiction.name, schema: ContradictionSchema },
      {
        name: EvidenceRequirementMatch.name,
        schema: EvidenceRequirementMatchSchema,
      },
      { name: GraphNode.name, schema: GraphNodeSchema },
      { name: GraphEdge.name, schema: GraphEdgeSchema },
    ]),
    QueuesModule,
  ],
  providers: [
    CaseIntelligenceService,
    ClaimService,
    ContradictionService,
    EmbeddingIndexService,
    GraphService,
    HybridRetrievalService,
    ReadinessService,
    RequirementService,
    TimelineService,
  ],
})
export class IntelligenceModule {}

export {
  CaseIntelligenceError,
  CaseIntelligenceService,
} from "./case-intelligence.service";
export { HybridRetrievalService } from "./hybrid-retrieval.service";
