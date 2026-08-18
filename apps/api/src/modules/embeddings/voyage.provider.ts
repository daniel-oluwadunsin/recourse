import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type EnvironmentConfig } from "@recourse/config";

import {
  EmbeddingProviderError,
  type EmbeddingProvider,
} from "./embedding.types";

const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";

@Injectable()
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config: ConfigService<EnvironmentConfig>) {}

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts, "document");
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embed([text], "query");
    if (!embedding) {
      throw new EmbeddingProviderError(
        "Voyage returned no query embedding.",
        "EMPTY_EMBEDDING_RESPONSE",
        false,
      );
    }
    return embedding;
  }

  async healthCheck(): Promise<{
    configured: boolean;
    provider: string;
    model: string;
  }> {
    return {
      configured: Boolean(this.config.get("EMBEDDING_API_KEY")),
      model: this.config.get("EMBEDDING_MODEL") ?? "voyage-4-lite",
      provider: this.config.get("EMBEDDING_PROVIDER") ?? "voyage",
    };
  }

  private async embed(
    texts: string[],
    inputType: "query" | "document",
  ): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (texts.some((text) => !text.trim())) {
      throw new EmbeddingProviderError(
        "Embedding input cannot be empty.",
        "EMPTY_EMBEDDING_INPUT",
        false,
      );
    }

    const apiKey = this.config.get("EMBEDDING_API_KEY");
    if (!apiKey) {
      throw new EmbeddingProviderError(
        "Embedding provider is not configured.",
        "EMBEDDING_NOT_CONFIGURED",
        false,
      );
    }

    const batchSize = this.config.get("EMBEDDING_BATCH_SIZE") ?? 64;
    const output: number[][] = [];
    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize);
      const response = await this.request(batch, inputType, apiKey);
      output.push(...response);
    }
    return output;
  }

  private async request(
    input: string[],
    inputType: "query" | "document",
    apiKey: string,
  ): Promise<number[][]> {
    const maxRetries = this.config.get("EMBEDDING_MAX_RETRIES") ?? 2;
    const baseDelay = this.config.get("EMBEDDING_RETRY_BASE_DELAY_MS") ?? 500;
    let attempt = 0;

    while (true) {
      try {
        const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
          body: JSON.stringify({
            input,
            input_type: inputType,
            model: this.config.get("EMBEDDING_MODEL") ?? "voyage-4-lite",
            output_dimension: this.config.get("EMBEDDING_DIMENSIONS") ?? 1024,
            output_dtype: "float",
            truncation: false,
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.timeout(
            this.config.get("EMBEDDING_REQUEST_TIMEOUT_MS") ?? 30000,
          ),
        });

        if (!response.ok) {
          const retryAfterMs = parseRetryAfter(
            response.headers.get("retry-after"),
          );
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < maxRetries) {
            await delay(retryAfterMs ?? baseDelay * 2 ** attempt);
            attempt += 1;
            continue;
          }
          throw new EmbeddingProviderError(
            "Voyage embedding request failed.",
            `VOYAGE_${response.status}`,
            retryable,
            retryAfterMs,
          );
        }

        const body = (await response.json()) as {
          data?: Array<{ embedding?: unknown; index?: unknown }>;
        };
        const embeddings = (body.data ?? [])
          .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0))
          .map((item) => item.embedding);
        if (
          embeddings.length !== input.length ||
          embeddings.some(
            (embedding): embedding is unknown[] =>
              !Array.isArray(embedding) ||
              embedding.length !==
                (this.config.get("EMBEDDING_DIMENSIONS") ?? 1024) ||
              embedding.some((value) => typeof value !== "number"),
          )
        ) {
          throw new EmbeddingProviderError(
            "Voyage returned an invalid embedding response.",
            "INVALID_EMBEDDING_RESPONSE",
            false,
          );
        }
        return embeddings as number[][];
      } catch (error: unknown) {
        if (error instanceof EmbeddingProviderError) throw error;
        if (attempt < maxRetries) {
          await delay(baseDelay * 2 ** attempt);
          attempt += 1;
          continue;
        }
        throw new EmbeddingProviderError(
          "Voyage embedding request could not be completed.",
          "VOYAGE_REQUEST_FAILED",
          true,
        );
      }
    }
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
