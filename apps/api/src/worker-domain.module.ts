import { Module } from "@nestjs/common";

import { DatabaseModule } from "./database/database.module";
import { SecurityModule } from "./common/security/security.module";
import { EvidenceModule } from "./modules/evidence/evidence.module";
import { ProcedureModule } from "./modules/procedure/procedure.module";
import { IntelligenceModule } from "./modules/intelligence/intelligence.module";

/**
 * Reusable persistence/evidence boundary for the standalone worker process.
 * The worker imports this compiled module through the API workspace package so
 * extraction and tombstone checks are not duplicated in a second runtime.
 */
@Module({
  exports: [EvidenceModule, ProcedureModule, IntelligenceModule],
  imports: [
    DatabaseModule,
    SecurityModule,
    EvidenceModule,
    ProcedureModule,
    IntelligenceModule,
  ],
})
export class WorkerDomainModule {}

export { EvidenceService } from "./modules/evidence/evidence.service";
export { EvidenceDeletedError } from "./modules/evidence/evidence.errors";
export { ExtractionFailure } from "./modules/evidence/extraction.types";
export { StorageProviderError } from "./modules/storage/storage.types";
export {
  ProcedureService,
  ProcedureResolutionError,
} from "./modules/procedure/procedure.service";
