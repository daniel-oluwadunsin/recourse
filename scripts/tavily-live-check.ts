import type { ConfigService } from "@nestjs/config";

import {
  parseEnvironment,
  type EnvironmentConfig,
} from "../packages/config/src/index.js";

import { TavilyProvider } from "../apps/api/src/modules/retrieval/tavily.provider";

async function main(): Promise<void> {
  const environment = parseEnvironment();
  const config = {
    get: <K extends keyof EnvironmentConfig>(key: K): EnvironmentConfig[K] =>
      environment[key],
    getOrThrow: <K extends keyof EnvironmentConfig>(
      key: K,
    ): EnvironmentConfig[K] => {
      const value = environment[key];
      if (value === undefined || value === null)
        throw new Error(`${String(key)} is not configured.`);
      return value;
    },
  } as unknown as ConfigService<EnvironmentConfig>;
  const provider = new TavilyProvider(config);
  const health = await provider.healthCheck();
  if (!health.configured) throw new Error("TAVILY_API_KEY is not configured.");
  const response = await provider.search({
    query: "site:docs.tavily.com Tavily API reference",
    maxResults: 3,
    searchDepth: "basic",
    includeDomains: ["docs.tavily.com"],
    includeUsage: true,
    timeoutSeconds: Math.min(environment.TAVILY_REQUEST_TIMEOUT_SECONDS, 60),
  });
  const url = response.results[0]?.url;
  if (!url) throw new Error("Tavily live check returned no result.");
  const extracted = await provider.extract({
    urls: [url],
    query: "Tavily API reference",
    extractDepth: "basic",
    chunksPerSource: 2,
    includeUsage: true,
    timeoutSeconds: Math.min(environment.TAVILY_REQUEST_TIMEOUT_SECONDS, 60),
  });
  if (!extracted.results[0]?.rawContent.trim())
    throw new Error("Tavily live check returned empty extracted content.");
  process.stdout.write(
    JSON.stringify({
      provider: "tavily",
      searchRequestId: response.requestId,
      extractRequestId: extracted.requestId,
      searchCredits: response.credits,
      extractCredits: extracted.credits,
      url,
      extractedCharacters: extracted.results[0].rawContent.length,
    }) + "\n",
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
