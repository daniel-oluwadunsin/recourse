import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { tavily } from "@tavily/core";

import { type EnvironmentConfig } from "@recourse/config";

import {
  type RetrievalCrawlResponse,
  type RetrievalExtractRequest,
  type RetrievalExtractResponse,
  type RetrievalMapResponse,
  type RetrievalSearchRequest,
  type RetrievalSearchResponse,
  type TavilyUsage,
  type WebRetrievalProvider,
} from "./retrieval.types";

export class WebRetrievalError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "WebRetrievalError";
  }
}

@Injectable()
export class TavilyProvider implements WebRetrievalProvider {
  private client: ReturnType<typeof tavily> | null = null;
  private usageCache: {
    value: TavilyUsage;
    expiresAt: number;
  } | null = null;

  constructor(private readonly config: ConfigService<EnvironmentConfig>) {}

  async search(
    request: RetrievalSearchRequest,
  ): Promise<RetrievalSearchResponse> {
    if (request.query.length > 400) {
      throw new WebRetrievalError(
        "Tavily queries must be under 400 characters.",
        "QUERY_TOO_LONG",
        false,
      );
    }
    try {
      const response = await this.clientFor().search(request.query, {
        searchDepth: request.searchDepth,
        topic: "general",
        maxResults: request.maxResults,
        includeAnswer: false,
        includeRawContent: false,
        includeDomains: request.includeDomains,
        country: request.country,
        includeUsage: request.includeUsage,
        timeout: request.timeoutSeconds,
      });
      return {
        query: response.query,
        results: response.results.map((result) => ({
          title: result.title,
          url: result.url,
          content: result.content,
          score: result.score,
          publishedDate: result.publishedDate || null,
        })),
        credits: response.usage?.credits ?? null,
        requestId: response.requestId ?? null,
        responseTimeSeconds: response.responseTime ?? null,
      };
    } catch (error: unknown) {
      if (error instanceof WebRetrievalError) throw error;
      throw toWebRetrievalError(error, "TAVILY_SEARCH_FAILED");
    }
  }

  async extract(
    request: RetrievalExtractRequest,
  ): Promise<RetrievalExtractResponse> {
    if (request.urls.length === 0 || request.urls.length > 20) {
      throw new WebRetrievalError(
        "Tavily Extract accepts between 1 and 20 URLs.",
        "EXTRACT_URL_LIMIT",
        false,
      );
    }
    try {
      const response = await this.clientFor().extract(request.urls, {
        query: request.query,
        chunksPerSource: request.chunksPerSource,
        extractDepth: request.extractDepth,
        format: "markdown",
        includeUsage: request.includeUsage,
        timeout: request.timeoutSeconds,
      });
      return {
        results: response.results.map((result) => ({
          url: result.url,
          title: result.title,
          rawContent: result.rawContent,
        })),
        failedResults: response.failedResults,
        credits: response.usage?.credits ?? null,
        requestId: response.requestId ?? null,
        responseTimeSeconds: response.responseTime ?? null,
      };
    } catch (error: unknown) {
      if (error instanceof WebRetrievalError) throw error;
      throw toWebRetrievalError(error, "TAVILY_EXTRACT_FAILED");
    }
  }

  async map(
    url: string,
    options: Parameters<WebRetrievalProvider["map"]>[1],
  ): Promise<RetrievalMapResponse> {
    try {
      const response = await this.clientFor().map(url, {
        maxDepth: options.maxDepth,
        maxBreadth: options.maxBreadth,
        limit: options.limit,
        allowExternal: false,
        includeUsage: options.includeUsage,
        timeout: options.timeoutSeconds,
      });
      return {
        baseUrl: response.baseUrl,
        urls: response.results,
        credits: response.usage?.credits ?? null,
        requestId: response.requestId ?? null,
        responseTimeSeconds: response.responseTime ?? null,
      };
    } catch (error: unknown) {
      if (error instanceof WebRetrievalError) throw error;
      throw toWebRetrievalError(error, "TAVILY_MAP_FAILED");
    }
  }

  async crawl(
    url: string,
    options: Parameters<WebRetrievalProvider["crawl"]>[1],
  ): Promise<RetrievalCrawlResponse> {
    try {
      const response = await this.clientFor().crawl(url, {
        maxDepth: options.maxDepth,
        maxBreadth: options.maxBreadth,
        limit: options.limit,
        instructions: options.instructions,
        selectDomains: options.selectDomains,
        allowExternal: false,
        extractDepth: "advanced",
        format: "markdown",
        includeUsage: options.includeUsage,
        timeout: options.timeoutSeconds,
      });
      return {
        baseUrl: response.baseUrl,
        results: response.results.map((result) => ({
          url: result.url,
          rawContent: result.rawContent,
        })),
        credits: response.usage?.credits ?? null,
        requestId: response.requestId ?? null,
        responseTimeSeconds: response.responseTime ?? null,
      };
    } catch (error: unknown) {
      if (error instanceof WebRetrievalError) throw error;
      throw toWebRetrievalError(error, "TAVILY_CRAWL_FAILED");
    }
  }

  async usage(): Promise<TavilyUsage> {
    if (this.usageCache && this.usageCache.expiresAt > Date.now()) {
      return this.usageCache.value;
    }
    const apiKey = this.config.get("TAVILY_API_KEY");
    if (!apiKey)
      throw new WebRetrievalError(
        "Tavily is not configured.",
        "TAVILY_NOT_CONFIGURED",
        false,
      );
    try {
      const response = await fetch("https://api.tavily.com/usage", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(this.config.get("TAVILY_PROJECT_ID")
            ? { "X-Project-ID": this.config.getOrThrow("TAVILY_PROJECT_ID") }
            : {}),
        },
        signal: AbortSignal.timeout(
          (this.config.get("TAVILY_REQUEST_TIMEOUT_SECONDS") ?? 60) * 1000,
        ),
      });
      if (!response.ok)
        throw new WebRetrievalError(
          "Tavily usage request failed.",
          `TAVILY_USAGE_${response.status}`,
          response.status === 429 || response.status >= 500,
        );
      const body = (await response.json()) as { key?: Record<string, unknown> };
      const key = body.key ?? {};
      const usage: TavilyUsage = {
        keyUsage: numberOrNull(key.usage),
        keyLimit: numberOrNull(key.limit),
        searchUsage: numberOrNull(key.search_usage),
        extractUsage: numberOrNull(key.extract_usage),
        crawlUsage: numberOrNull(key.crawl_usage),
        mapUsage: numberOrNull(key.map_usage),
        fetchedAt: new Date(),
      };
      this.usageCache = {
        value: usage,
        expiresAt:
          Date.now() +
          (this.config.get("TAVILY_USAGE_CACHE_TTL_MS") ?? 600_000),
      };
      return usage;
    } catch (error: unknown) {
      if (error instanceof WebRetrievalError) throw error;
      throw toWebRetrievalError(error, "TAVILY_USAGE_FAILED");
    }
  }

  async healthCheck(): Promise<{ configured: boolean; provider: string }> {
    return {
      configured: Boolean(this.config.get("TAVILY_API_KEY")),
      provider: "tavily",
    };
  }

  private clientFor(): ReturnType<typeof tavily> {
    const apiKey = this.config.get("TAVILY_API_KEY");
    if (!apiKey)
      throw new WebRetrievalError(
        "Tavily is not configured.",
        "TAVILY_NOT_CONFIGURED",
        false,
      );
    if (!this.client) {
      this.client = tavily({
        apiKey,
        projectId: this.config.get("TAVILY_PROJECT_ID"),
      });
    }
    return this.client;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toWebRetrievalError(
  error: unknown,
  fallbackCode: string,
): WebRetrievalError {
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
    headers?: Headers;
    message?: unknown;
  };
  const status =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.response?.status === "number"
        ? candidate.response.status
        : null;
  const retryAfter = candidate.headers?.get("retry-after");
  const retryable =
    status === 408 ||
    status === 429 ||
    (status !== null && status >= 500) ||
    status === null;
  return new WebRetrievalError(
    retryable
      ? "Tavily was temporarily unavailable."
      : "Tavily rejected the request.",
    status === 429 ? "TAVILY_RATE_LIMITED" : fallbackCode,
    retryable,
    retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : null,
  );
}
