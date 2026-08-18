import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { EMBEDDING_PROVIDER } from "./embedding.types";
import { VoyageEmbeddingProvider } from "./voyage.provider";

@Module({
  exports: [EMBEDDING_PROVIDER, VoyageEmbeddingProvider],
  imports: [ConfigModule],
  providers: [
    VoyageEmbeddingProvider,
    {
      provide: EMBEDDING_PROVIDER,
      useExisting: VoyageEmbeddingProvider,
    },
  ],
})
export class EmbeddingsModule {}

export {
  EMBEDDING_PROVIDER,
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "./embedding.types";
export { VoyageEmbeddingProvider } from "./voyage.provider";
