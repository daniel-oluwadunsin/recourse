import { Module } from "@nestjs/common";

import { DatabaseModule } from "./database/database.module";
import { EvidenceModule } from "./modules/evidence/evidence.module";

/**
 * Reusable persistence/evidence boundary for the standalone worker process.
 * The worker imports this compiled module through the API workspace package so
 * extraction and tombstone checks are not duplicated in a second runtime.
 */
@Module({
  exports: [EvidenceModule],
  imports: [DatabaseModule, EvidenceModule],
})
export class WorkerDomainModule {}

export { EvidenceService } from "./modules/evidence/evidence.service";
export { EvidenceDeletedError } from "./modules/evidence/evidence.errors";
export { ExtractionFailure } from "./modules/evidence/extraction.types";
export { StorageProviderError } from "./modules/storage/storage.types";
