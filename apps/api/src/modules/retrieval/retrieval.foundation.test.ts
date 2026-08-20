import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { type EnvironmentConfig } from "@recourse/config";
import { AuthorityRankingService } from "./authority-ranking.service";
import { TavilyProvider } from "./tavily.provider";
import { dedupeUrls, normalizeUrl } from "./url-normalizer";

const tavilyClient = vi.hoisted(() => ({
  search: vi.fn(),
  extract: vi.fn(),
  map: vi.fn(),
  crawl: vi.fn(),
}));

vi.mock("@tavily/core", () => ({
  tavily: vi.fn(() => tavilyClient),
}));

describe("retrieval safety and provenance foundations", () => {
  it("normalizes tracking parameters, removes fragments, blocks private hosts, and deduplicates URLs", () => {
    expect(
      normalizeUrl("https://Example.com/help/?utm_source=x&b=2&a=1#fragment"),
    ).toEqual({
      canonicalUrl: "https://example.com/help?a=1&b=2",
      domain: "example.com",
    });
    expect(normalizeUrl("http://127.0.0.1/admin")).toBeNull();
    expect(normalizeUrl("http://[::ffff:127.0.0.1]/admin")).toBeNull();
    expect(normalizeUrl("http://[fe80::1]/admin")).toBeNull();
    expect(normalizeUrl("file:///tmp/secret")).toBeNull();
    expect(
      dedupeUrls([
        "https://example.com/a#one",
        "https://example.com/a?utm_campaign=x",
      ]),
    ).toHaveLength(1);
  });

  it("ranks only configured verified domains as official institution sources", () => {
    const service = new AuthorityRankingService();
    const institution = {
      verifiedOfficialDomains: ["official.example"],
      categories: [],
    } as never;
    const official = service.rank({
      url: "https://official.example/help",
      institution,
      jurisdictionKey: "NG",
      relationship: "CONSUMER",
      decisionType: "SUSPENSION",
    });
    const unofficial = service.rank({
      url: "https://forum.example/help",
      institution,
      jurisdictionKey: "NG",
      relationship: "CONSUMER",
      decisionType: "SUSPENSION",
    });
    expect(official?.authorityTier).toBe("TIER_1_OFFICIAL_INSTITUTION");
    expect(unofficial?.authorityTier).toBe("TIER_3_UNOFFICIAL");
    expect(unofficial?.factors.officialDomain).toBe(0);
    expect(official?.factors.jurisdictionMatch).toBe(-35);
  });

  it("does not promote user-generated pages on an official domain", () => {
    const service = new AuthorityRankingService();
    const institution = {
      verifiedOfficialDomains: ["support.example", "video.example"],
      categories: [],
    } as never;

    for (const url of [
      "https://support.example/product/thread/123/user-answer",
      "https://support.example/product/community-guide/456/post",
      "https://video.example/watch?v=creator-upload",
    ]) {
      expect(
        service.rank({
          url,
          institution,
          jurisdictionKey: null,
          relationship: "CONSUMER",
          decisionType: "SUSPENSION",
        })?.authorityTier,
      ).toBe("TIER_3_UNOFFICIAL");
    }
  });

  it("rejects Tavily calls without a configured key and maps search responses without treating snippets as snapshots", async () => {
    const provider = new TavilyProvider(
      new ConfigService({} as EnvironmentConfig),
    );
    await expect(
      provider.search({
        query: "official procedure",
        maxResults: 3,
        searchDepth: "basic",
        includeUsage: true,
        timeoutSeconds: 10,
      }),
    ).rejects.toMatchObject({
      code: "TAVILY_NOT_CONFIGURED",
    });

    tavilyClient.search.mockResolvedValueOnce({
      query: "official procedure",
      results: [
        {
          title: "Result",
          url: "https://official.example/help",
          content: "snippet",
          score: 0.9,
          publishedDate: "",
          id: "1",
        },
      ],
      images: [],
      responseTime: 0.1,
      requestId: "req-1",
      usage: { credits: 1 },
    });
    const configured = new TavilyProvider(
      new ConfigService({ TAVILY_API_KEY: "tvly-test" } as EnvironmentConfig),
    );
    const response = await configured.search({
      query: "official procedure",
      maxResults: 3,
      searchDepth: "basic",
      includeUsage: true,
      timeoutSeconds: 10,
    });
    expect(response.results[0]?.content).toBe("snippet");
    expect(response.results[0]).not.toHaveProperty("paragraphs");
  });

  it("classifies provider failures as retryable adapter errors", async () => {
    tavilyClient.search.mockRejectedValueOnce(new Error("network timeout"));
    const provider = new TavilyProvider(
      new ConfigService({ TAVILY_API_KEY: "tvly-test" } as EnvironmentConfig),
    );
    await expect(
      provider.search({
        query: "official procedure",
        maxResults: 3,
        searchDepth: "basic",
        includeUsage: true,
        timeoutSeconds: 10,
      }),
    ).rejects.toMatchObject({ code: "TAVILY_SEARCH_FAILED", retryable: true });
  });
});
