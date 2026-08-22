import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { tavily } from '@tavily/core';
import type { Model } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import type { CaseUnderstanding } from '@recourse/shared';
import { AppError } from './common';
import { Environment } from './config';
import { ResearchCacheRecord } from './database.schemas';
import { GeminiService } from './gemini.service';

export interface ResearchResult {
  procedure: Record<string, unknown>;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    domain: string;
    excerpt: string;
    authority: 'official' | 'regulator' | 'trusted_guidance' | 'other';
    accessedAt: string;
  }>;
  researchedAt: string;
  cacheKey: string;
}

@Injectable()
export class ResearchService {
  private readonly client: ReturnType<typeof tavily> | null;

  constructor(
    @Inject(Environment) private readonly environment: Environment,
    @Inject(GeminiService) private readonly gemini: GeminiService,
    @InjectModel(ResearchCacheRecord.name)
    private readonly cache: Model<ResearchCacheRecord>,
  ) {
    this.client = environment.TAVILY_API_KEY
      ? tavily({ apiKey: environment.TAVILY_API_KEY })
      : null;
  }

  async research(understanding: CaseUnderstanding): Promise<ResearchResult> {
    if (!this.client)
      throw new AppError(
        'RESEARCH_NOT_CONFIGURED',
        'Live process research is not configured.',
        503,
        true,
      );
    const cacheKey = researchCacheKey(understanding);
    const cached = await this.cache
      .findOne({ cacheKey, expiresAt: { $gt: new Date() } })
      .lean()
      .exec();
    if (cached) return cached.result as unknown as ResearchResult;

    const query = buildResearchQuery(understanding);
    try {
      let response = await this.client.search(query, {
        searchDepth: 'basic',
        maxResults: 5,
        includeAnswer: false,
        includeRawContent: false,
        autoParameters: false,
        topic: 'general',
        includeUsage: true,
        timeout: 30,
      });
      let ranked = response.results
        .filter((result) => safeHttpUrl(result.url))
        .map((result) => ({
          result,
          score: authorityScore(
            result.url,
            result.title,
            result.content,
            understanding,
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score);
      if (ranked.length === 0) {
        const fallbackQuery = [
          understanding.institution,
          understanding.decision,
          understanding.jurisdiction,
          'official policy reconsideration complaint contact',
        ]
          .filter(Boolean)
          .join(' ')
          .slice(0, 399);
        response = await this.client.search(fallbackQuery, {
          searchDepth: 'basic',
          maxResults: 5,
          includeAnswer: false,
          includeRawContent: false,
          autoParameters: false,
          topic: 'general',
          includeUsage: true,
          timeout: 30,
        });
        ranked = response.results
          .filter((result) => safeHttpUrl(result.url))
          .map((result) => ({
            result,
            score: authorityScore(
              result.url,
              result.title,
              result.content,
              understanding,
            ),
          }))
          .filter(({ score }) => score > 0)
          .sort((left, right) => right.score - left.score);
      }
      if (ranked.length === 0)
        return this.noProcess(cacheKey, understanding, []);

      const urls = ranked.slice(0, 3).map(({ result }) => result.url);
      const extracted = await this.client.extract(urls, {
        extractDepth: 'basic',
        format: 'markdown',
        query,
        chunksPerSource: 3,
        includeUsage: true,
        timeout: 30,
      });
      const sources = extracted.results.map((item) => {
        const domain = new URL(item.url).hostname.toLowerCase();
        return {
          id: randomUUID(),
          title: item.title ?? domain,
          url: item.url,
          domain,
          excerpt: boundExcerpt(item.rawContent),
          authority: authorityLabel(domain, item.title ?? '', understanding),
          accessedAt: new Date().toISOString(),
        } as const;
      });
      if (sources.length === 0)
        return this.noProcess(cacheKey, understanding, []);
      const procedure = await this.gemini.extractProcedure({
        understanding,
        sources,
      });
      const result: ResearchResult = {
        procedure,
        sources,
        researchedAt: new Date().toISOString(),
        cacheKey,
      };
      if (
        procedure.status === 'VERIFIED' ||
        procedure.status === 'NOT_FOUND' ||
        procedure.status === 'UNVERIFIED'
      ) {
        await this.cache.updateOne(
          { cacheKey },
          { result, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
          { upsert: true },
        );
      }
      return result;
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const candidate = error as { status?: number; message?: string };
      if (candidate.status === 429 || candidate.message?.includes('429')) {
        throw new AppError(
          'RESEARCH_QUOTA_REACHED',
          'We have reached the current research usage limit. Your case is saved.',
          429,
          true,
        );
      }
      throw new AppError(
        'RESEARCH_UNAVAILABLE',
        'I could not verify the current process yet. Your case is saved.',
        503,
        true,
      );
    }
  }

  private async noProcess(
    cacheKey: string,
    understanding: CaseUnderstanding,
    sources: ResearchResult['sources'],
  ): Promise<ResearchResult> {
    const procedure = await this.gemini.extractProcedure({
      understanding,
      sources,
      noSourcesFound: true,
    });
    const result = {
      procedure,
      sources,
      researchedAt: new Date().toISOString(),
      cacheKey,
    };
    await this.cache.updateOne(
      { cacheKey },
      { result, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
      { upsert: true },
    );
    return result;
  }
}

export function buildResearchQuery(understanding: CaseUnderstanding): string {
  return [
    understanding.institution,
    understanding.decision,
    understanding.statedReason,
    understanding.jurisdiction,
    'official review appeal complaint procedure deadline',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 399);
}

export function researchCacheKey(understanding: CaseUnderstanding): string {
  const normalized = [
    understanding.institution,
    understanding.decision,
    understanding.statedReason,
    understanding.jurisdiction,
  ]
    .map(
      (value) =>
        value
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim() ?? '',
    )
    .join('|');
  return createHash('sha256').update(normalized).digest('hex');
}

export function authorityScore(
  url: string,
  title: string,
  content: string,
  understanding: CaseUnderstanding,
): number {
  const parsed = new URL(url);
  const domain = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  const text = `${title} ${content}`.toLowerCase();
  const institutionTokens = (understanding.institution ?? '')
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 3);
  let score = 0;
  if (/\.gov(?:\.|$)/.test(domain) || /\.go[vb]\.[a-z]{2}$/.test(domain))
    score += 45;
  if (institutionTokens.some((token) => domain.includes(token))) score += 40;
  if (institutionTokens.some((token) => title.toLowerCase().includes(token)))
    score += 15;
  if (/appeal|review|complaint|reconsider|dispute|deadline/.test(text))
    score += 20;
  if (
    understanding.jurisdiction &&
    text.includes(understanding.jurisdiction.toLowerCase())
  )
    score += 10;
  if (
    /community|forum|thread|reddit|youtube|social|blog/.test(`${domain}${path}`)
  )
    score -= 50;
  return score;
}

function authorityLabel(
  domain: string,
  title: string,
  understanding: CaseUnderstanding,
): ResearchResult['sources'][number]['authority'] {
  if (/\.gov(?:\.|$)/.test(domain)) return 'regulator';
  const tokens = (understanding.institution ?? '')
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 3);
  if (
    tokens.some(
      (token) => domain.includes(token) || title.toLowerCase().includes(token),
    )
  )
    return 'official';
  return 'trusted_guidance';
}

function safeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function boundExcerpt(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= 4_000
    ? normalized
    : `${normalized.slice(0, 4_000)}…`;
}
