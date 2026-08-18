import {
  type SourceAuthorityTier,
  type RetrievalOperation,
} from "@recourse/contracts";

export interface RetrievalSearchRequest {
  query: string;
  maxResults: number;
  searchDepth: "basic" | "advanced";
  includeDomains?: string[];
  country?: string;
  includeUsage: boolean;
  timeoutSeconds: number;
}

export interface RetrievalSearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate: string | null;
}

export interface RetrievalSearchResponse {
  query: string;
  results: RetrievalSearchResult[];
  credits: number | null;
  requestId: string | null;
  responseTimeSeconds: number | null;
}

export interface RetrievalExtractRequest {
  urls: string[];
  query: string;
  extractDepth: "basic" | "advanced";
  chunksPerSource: number;
  includeUsage: boolean;
  timeoutSeconds: number;
}

export interface RetrievalExtractResult {
  url: string;
  title: string | null;
  rawContent: string;
}

export interface RetrievalExtractResponse {
  results: RetrievalExtractResult[];
  failedResults: Array<{ url: string; error: string }>;
  credits: number | null;
  requestId: string | null;
  responseTimeSeconds: number | null;
}

export interface RetrievalMapResponse {
  baseUrl: string;
  urls: string[];
  credits: number | null;
  requestId: string | null;
  responseTimeSeconds: number | null;
}

export interface RetrievalCrawlResult {
  url: string;
  rawContent: string;
}

export interface RetrievalCrawlResponse {
  baseUrl: string;
  results: RetrievalCrawlResult[];
  credits: number | null;
  requestId: string | null;
  responseTimeSeconds: number | null;
}

export interface TavilyUsage {
  keyUsage: number | null;
  keyLimit: number | null;
  searchUsage: number | null;
  extractUsage: number | null;
  crawlUsage: number | null;
  mapUsage: number | null;
  fetchedAt: Date;
}

export interface WebRetrievalProvider {
  search(request: RetrievalSearchRequest): Promise<RetrievalSearchResponse>;
  extract(request: RetrievalExtractRequest): Promise<RetrievalExtractResponse>;
  map(
    url: string,
    options: {
      maxDepth: number;
      maxBreadth: number;
      limit: number;
      includeUsage: boolean;
      timeoutSeconds: number;
    },
  ): Promise<RetrievalMapResponse>;
  crawl(
    url: string,
    options: {
      maxDepth: number;
      maxBreadth: number;
      limit: number;
      instructions: string;
      selectDomains: string[];
      includeUsage: boolean;
      timeoutSeconds: number;
    },
  ): Promise<RetrievalCrawlResponse>;
  usage(): Promise<TavilyUsage>;
  healthCheck(): Promise<{ configured: boolean; provider: string }>;
}

export interface AuthorityScoreFactors {
  officialDomain: number;
  authorityTier: number;
  jurisdictionMatch: number;
  relationshipMatch: number;
  decisionRelevance: number;
  freshness: number;
}

export interface RankedSource {
  canonicalUrl: string;
  domain: string;
  authorityTier: SourceAuthorityTier;
  score: number;
  factors: AuthorityScoreFactors;
  operation: RetrievalOperation;
}
