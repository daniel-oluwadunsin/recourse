import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Groq, { APIError } from "groq-sdk";
import { performance } from "node:perf_hooks";
import { z } from "zod";

import { type EnvironmentConfig } from "@recourse/config";

import { toGroqStrictJsonSchema } from "./json-schema";
import {
  AIProviderError,
  type AIImageContentPart,
  type AIMessage,
  type AIUsage,
  type GenerativeAIProvider,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "./ai.types";

@Injectable()
export class GroqProvider implements GenerativeAIProvider {
  private client: Groq | null = null;

  constructor(private readonly config: ConfigService<EnvironmentConfig>) {}

  async completeStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    const schema = toGroqStrictJsonSchema(request.schema);
    return this.complete(request, {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema,
        },
      },
      messages: request.messages,
    });
  }

  async completeMultimodalStructured<T>(
    request: StructuredGenerationRequest<T> & { imageUrl: string },
  ): Promise<StructuredGenerationResult<T>> {
    const content: AIImageContentPart[] = [
      { type: "image_url", image_url: { url: request.imageUrl } },
    ];
    const messages: AIMessage[] = request.messages.map((message, index) =>
      index === request.messages.length - 1 && message.role === "user"
        ? {
            ...message,
            content:
              typeof message.content === "string"
                ? [{ type: "text", text: message.content }, ...content]
                : [...message.content, ...content],
          }
        : message,
    );

    // Groq's current vision model supports JSON mode, not strict JSON Schema.
    // The response is still validated with the operation's Zod schema.
    return this.complete(request, {
      response_format: { type: "json_object" },
      messages,
      structuredMode: "json_object",
    });
  }

  async healthCheck(): Promise<{ configured: boolean; modelIds: string[] }> {
    if (!this.config.get("GROQ_API_KEY")) {
      return { configured: false, modelIds: [] };
    }

    try {
      const models = await this.clientFor().models.list();
      return {
        configured: true,
        modelIds: models.data.map((model) => model.id),
      };
    } catch (error: unknown) {
      throw this.toProviderError(error, "MODEL_LIST_FAILED");
    }
  }

  private async complete<T>(
    request: StructuredGenerationRequest<T>,
    options: {
      response_format:
        | {
            type: "json_schema";
            json_schema: {
              name: string;
              strict: true;
              schema: Record<string, unknown>;
            };
          }
        | { type: "json_object" };
      messages: readonly AIMessage[];
      structuredMode?: "strict" | "json_object";
    },
  ): Promise<StructuredGenerationResult<T>> {
    const maxRetries = this.config.get("GROQ_MAX_RETRIES") ?? 2;
    const baseDelay = this.config.get("GROQ_RETRY_BASE_DELAY_MS") ?? 500;
    let attempt = 0;

    while (true) {
      const started = performance.now();
      try {
        const response = await this.clientFor().chat.completions.create({
          model: request.model,
          messages: options.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })) as never,
          max_completion_tokens: request.maxCompletionTokens,
          reasoning_format: "hidden",
          reasoning_effort: request.reasoningEffort,
          response_format: options.response_format,
          stream: false,
        });
        const content = response.choices[0]?.message.content;
        if (!content) {
          throw new AIProviderError(
            "Groq returned no structured content.",
            "EMPTY_PROVIDER_RESPONSE",
            false,
          );
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(content) as unknown;
        } catch {
          throw new AIProviderError(
            "Groq returned invalid JSON content.",
            "INVALID_PROVIDER_JSON",
            false,
          );
        }

        const parsed = request.schema.safeParse(parsedJson);
        if (!parsed.success) {
          throw new AIProviderError(
            "Groq output failed the operation schema.",
            "PROVIDER_SCHEMA_MISMATCH",
            false,
          );
        }

        return {
          latencyMs: Math.round(performance.now() - started),
          model: request.model,
          output: parsed.data,
          providerRequestId: response.id ?? null,
          structuredMode: options.structuredMode ?? "strict",
          usage: usageFromResponse(response.usage),
        };
      } catch (error: unknown) {
        const providerError =
          error instanceof AIProviderError
            ? error
            : this.toProviderError(error, "GROQ_REQUEST_FAILED");
        if (!providerError.retryable || attempt >= maxRetries) {
          throw providerError;
        }

        const retryAfter = providerError.retryAfterMs ?? 0;
        const jitter = Math.floor(Math.random() * Math.max(baseDelay, 1));
        const delay = Math.max(retryAfter, baseDelay * 2 ** attempt + jitter);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        attempt += 1;
      }
    }
  }

  private clientFor(): Groq {
    const apiKey = this.config.get("GROQ_API_KEY");
    if (!apiKey) {
      throw new AIProviderError(
        "Groq is not configured.",
        "AI_PROVIDER_NOT_CONFIGURED",
        false,
      );
    }

    if (!this.client) {
      this.client = new Groq({
        apiKey,
        maxRetries: 0,
        timeout: this.config.get("GROQ_REQUEST_TIMEOUT_MS") ?? 30000,
      });
    }

    return this.client;
  }

  private toProviderError(
    error: unknown,
    fallbackCode: string,
  ): AIProviderError {
    if (error instanceof AIProviderError) {
      return error;
    }

    if (error instanceof APIError) {
      const status = typeof error.status === "number" ? error.status : null;
      const retryable =
        status === 408 ||
        status === 409 ||
        status === 429 ||
        (status ?? 0) >= 500;
      const retryHeader = error.headers?.get("retry-after");
      const retryAfterMs = retryHeader ? parseRetryAfter(retryHeader) : null;
      const code =
        status === 400 || status === 422
          ? "GROQ_STRUCTURED_OUTPUT_REJECTED"
          : status === 413
            ? "AI_INPUT_TOO_LARGE"
            : status === 401 || status === 403
              ? "AI_PROVIDER_AUTH_FAILED"
              : status === 429
                ? "GROQ_RATE_LIMITED"
                : fallbackCode;
      return new AIProviderError(
        retryable
          ? "Groq request was temporarily unavailable."
          : "Groq request was rejected.",
        code,
        retryable,
        status,
        retryAfterMs,
      );
    }

    return new AIProviderError(
      "Groq request failed before a response was received.",
      "GROQ_NETWORK_ERROR",
      true,
    );
  }
}

function usageFromResponse(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | null
    | undefined,
): AIUsage {
  return {
    completionTokens: usage?.completion_tokens ?? 0,
    promptTokens: usage?.prompt_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

function parseRetryAfter(value: string): number | null {
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(Math.round(seconds * 1000), 0), 120_000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(Math.max(date - Date.now(), 0), 120_000)
    : null;
}

export function assertStructuredOutput<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  return schema.parse(value);
}
