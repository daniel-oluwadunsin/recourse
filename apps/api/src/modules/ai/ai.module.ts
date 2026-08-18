import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";

import { CasesModule } from "../cases/cases.module";
import { Case, CaseSchema } from "../cases/schemas/case.schema";
import { Decision, DecisionSchema } from "../cases/schemas/decision.schema";
import { Evidence, EvidenceSchema } from "../evidence/schemas/evidence.schema";
import {
  EvidenceBlock,
  EvidenceBlockSchema,
} from "../evidence/schemas/evidence-block.schema";
import { StorageModule } from "../storage/storage.module";
import { AIJobService } from "./ai-job.service";
import { AIOperationService } from "./ai-operation.service";
import { AIRunService } from "./ai-run.service";
import { GroqProvider } from "./groq.provider";
import { AIModelRouterService } from "./model-router.service";
import { AIRun, AIRunSchema } from "./schemas/ai-run.schema";

@Module({
  exports: [AIJobService, AIOperationService, AIRunService, GroqProvider],
  imports: [
    ConfigModule,
    forwardRef(() => CasesModule),
    MongooseModule.forFeature([
      { name: AIRun.name, schema: AIRunSchema },
      { name: Case.name, schema: CaseSchema },
      { name: Decision.name, schema: DecisionSchema },
      { name: Evidence.name, schema: EvidenceSchema },
      { name: EvidenceBlock.name, schema: EvidenceBlockSchema },
    ]),
    StorageModule,
  ],
  providers: [
    AIJobService,
    AIOperationService,
    AIRunService,
    GroqProvider,
    AIModelRouterService,
  ],
})
export class AIModule {}

export { AIJobDomainError, AIJobService } from "./ai-job.service";
export { AIOperationService } from "./ai-operation.service";
export { AIRunService } from "./ai-run.service";
export { GroqProvider } from "./groq.provider";
export { AIProviderError } from "./ai.types";
