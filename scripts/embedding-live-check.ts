import { parseEnvironment } from "../packages/config/src/index.js";
import { VoyageEmbeddingProvider } from "../apps/api/src/modules/embeddings/voyage.provider.js";

async function main(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const config = {
    get: <K extends keyof typeof environment>(key: K) => environment[key],
    getOrThrow: <K extends keyof typeof environment>(key: K) => {
      const value = environment[key];
      if (value === undefined || value === null) {
        throw new Error(`${String(key)} is not configured.`);
      }
      return value;
    },
  } as ConstructorParameters<typeof VoyageEmbeddingProvider>[0];
  const provider = new VoyageEmbeddingProvider(config);
  const health = await provider.healthCheck();
  if (!health.configured)
    throw new Error("EMBEDDING_API_KEY is not configured.");

  const embedding = await provider.embedQuery("Recourse embedding live check");
  if (embedding.length !== environment.EMBEDDING_DIMENSIONS) {
    throw new Error("Embedding live check returned an unexpected dimension.");
  }

  process.stdout.write(
    JSON.stringify({
      dimensions: embedding.length,
      model: health.model,
      provider: health.provider,
    }) + "\n",
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
