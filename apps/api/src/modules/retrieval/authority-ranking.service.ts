import { Injectable } from "@nestjs/common";

import { type InstitutionDocument } from "../cases/schemas/institution.schema";
import {
  type DecisionType,
  type RelationshipType,
  type SourceAuthorityTier,
} from "@recourse/contracts";
import { normalizeUrl } from "./url-normalizer";
import { type RankedSource } from "./retrieval.types";

@Injectable()
export class AuthorityRankingService {
  rank(input: {
    url: string;
    institution: InstitutionDocument | null;
    jurisdictionKey: string | null;
    relationship: RelationshipType;
    decisionType: DecisionType;
    publishedDate?: string | null;
    text?: string;
  }): RankedSource | null {
    const normalized = normalizeUrl(input.url);
    if (!normalized) return null;
    const officialDomain =
      input.institution?.verifiedOfficialDomains.some(
        (domain) =>
          normalized.domain === domain ||
          normalized.domain.endsWith(`.${domain}`),
      ) ?? false;
    const official =
      officialDomain && isInstitutionPublishedPage(normalized.canonicalUrl);
    const isGovernment =
      normalized.domain.endsWith(".gov") || normalized.domain.includes(".gov.");
    const isRegulator =
      input.institution?.categories.some((category) =>
        /regulator|adr|government/i.test(category),
      ) ?? false;
    const authorityTier: SourceAuthorityTier = official
      ? "TIER_1_OFFICIAL_INSTITUTION"
      : isGovernment && isRegulator
        ? "TIER_1_REGULATOR_ADR"
        : isGovernment
          ? "TIER_1_OFFICIAL_GOVERNMENT"
          : "TIER_3_UNOFFICIAL";
    const searchableText = (input.text ?? "").toLowerCase();
    const factors = {
      officialDomain: official ? 50 : 0,
      authorityTier:
        authorityTier === "TIER_1_OFFICIAL_INSTITUTION"
          ? 35
          : authorityTier.startsWith("TIER_1")
            ? 30
            : 0,
      jurisdictionMatch: jurisdictionMatches(
        input.jurisdictionKey,
        normalized.domain,
      )
        ? 20
        : input.jurisdictionKey
          ? -35
          : 0,
      relationshipMatch: relevanceScore(
        searchableText,
        relationshipTerms(input.relationship),
      ),
      decisionRelevance: relevanceScore(
        searchableText,
        decisionTerms(input.decisionType),
      ),
      freshness: freshnessScore(input.publishedDate),
    };
    return {
      canonicalUrl: normalized.canonicalUrl,
      domain: normalized.domain,
      authorityTier,
      score: Object.values(factors).reduce((sum, value) => sum + value, 0),
      factors,
      operation: "SEARCH",
    };
  }
}

/** User-generated and media pages do not become authoritative merely because
 * they are hosted below an institution's verified domain. */
export function isInstitutionPublishedPage(canonicalUrl: string): boolean {
  const path = new URL(canonicalUrl).pathname.toLowerCase();
  return ![
    /\/(?:community|community-guide|thread|threads)(?:\/|$)/u,
    /\/(?:channel|shorts|user|watch)(?:\/|$)/u,
    /\/@[^/]+(?:\/|$)/u,
  ].some((pattern) => pattern.test(path));
}

function relevanceScore(text: string, terms: string[]): number {
  return terms.some((term) => text.includes(term)) ? 10 : 0;
}

function relationshipTerms(value: RelationshipType): string[] {
  return value === "UNKNOWN"
    ? []
    : [
        value.toLowerCase(),
        value === "CONSUMER" ? "user" : value.toLowerCase(),
      ];
}

function decisionTerms(value: DecisionType): string[] {
  return value === "UNKNOWN"
    ? []
    : [value.toLowerCase(), value.toLowerCase().replace(/_/g, " ")];
}

function jurisdictionMatches(
  jurisdictionKey: string | null,
  domain: string,
): boolean {
  if (!jurisdictionKey) return false;
  const country = jurisdictionKey.split(":")[0]?.toLowerCase();
  return Boolean(
    country &&
    (domain.endsWith(`.${country}`) || domain.includes(`.${country}.`)),
  );
}

function freshnessScore(publishedDate: string | null | undefined): number {
  if (!publishedDate) return 0;
  const ageDays = (Date.now() - Date.parse(publishedDate)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0) return 0;
  return ageDays <= 365 ? 5 : ageDays <= 1095 ? 2 : 0;
}
