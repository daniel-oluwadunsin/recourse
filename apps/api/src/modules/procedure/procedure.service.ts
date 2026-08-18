import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isValidObjectId, Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";
import {
  procedureRetrievalJobPayloadSchema,
  type ProcedureRetrievalJobPayload,
  type ProceduralClaimVerificationStatus,
  type SourceAuthorityTier,
} from "@recourse/contracts";
import { AIOperationService } from "../ai/ai-operation.service";
import { AIProviderError } from "../ai/ai.types";
import { CaseStateMachineService } from "../cases/case-state-machine.service";
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from "../embeddings/embedding.types";
import { Case } from "../cases/schemas/case.schema";
import { Decision } from "../cases/schemas/decision.schema";
import { InstitutionLookupService } from "../cases/institutions.service";
import { Institution } from "../cases/schemas/institution.schema";
import { AuthorityRankingService } from "../retrieval/authority-ranking.service";
import { dedupeUrls, normalizeUrl } from "../retrieval/url-normalizer";
import { TavilyProvider } from "../retrieval/tavily.provider";
import {
  type RetrievalSearchResult,
  type RetrievalExtractResult,
} from "../retrieval/retrieval.types";
import { RetrievalRun } from "../retrieval/schemas/retrieval-run.schema";
import { SourceSnapshot } from "../retrieval/schemas/source-snapshot.schema";
import { hashInput } from "../ai/ai-operation.service";
import {
  ProcedureQueryBuilderService,
  type ProcedureQueryPlan,
} from "./procedure-query-builder.service";
import { ProcedureConfidenceService } from "./procedure-confidence.service";
import { Procedure } from "./schemas/procedure.schema";
import { ProcedureVersion } from "./schemas/procedure-version.schema";
import { ProceduralClaim } from "./schemas/procedural-claim.schema";
import { type ExtractProcedureOutput } from "../ai/operation-schemas";
import { ProcedureSourceChunk } from "./schemas/procedure-source-chunk.schema";

export class ProcedureResolutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProcedureResolutionError";
  }
}

@Injectable()
export class ProcedureService {
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Decision.name) private readonly decisionModel: Model<Decision>,
    @InjectModel(Institution.name)
    private readonly institutionModel: Model<Institution>,
    @InjectModel(RetrievalRun.name)
    private readonly retrievalRunModel: Model<RetrievalRun>,
    @InjectModel(SourceSnapshot.name)
    private readonly sourceSnapshotModel: Model<SourceSnapshot>,
    @InjectModel(Procedure.name)
    private readonly procedureModel: Model<Procedure>,
    @InjectModel(ProcedureVersion.name)
    private readonly procedureVersionModel: Model<ProcedureVersion>,
    @InjectModel(ProceduralClaim.name)
    private readonly claimModel: Model<ProceduralClaim>,
    @InjectModel(ProcedureSourceChunk.name)
    private readonly sourceChunkModel: Model<ProcedureSourceChunk>,
    private readonly tavily: TavilyProvider,
    private readonly ai: AIOperationService,
    private readonly queryBuilder: ProcedureQueryBuilderService,
    private readonly confidence: ProcedureConfidenceService,
    private readonly authority: AuthorityRankingService,
    private readonly institutionLookup: InstitutionLookupService,
    private readonly stateMachine: CaseStateMachineService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async resolve(payload: ProcedureRetrievalJobPayload): Promise<{
    status: string;
    procedureId: string | null;
    versionId: string | null;
  }> {
    const parsed = procedureRetrievalJobPayloadSchema.parse(payload);
    if (!isValidObjectId(parsed.caseId))
      throw new ProcedureResolutionError(
        "INVALID_CASE_ID",
        "Case identifier is invalid.",
      );
    const caseDocument = await this.caseModel
      .findOne({ _id: new Types.ObjectId(parsed.caseId), deletedAt: null })
      .exec();
    if (!caseDocument)
      throw new ProcedureResolutionError(
        "DELETED_OR_MISSING_CASE",
        "Case is unavailable.",
      );
    if (
      caseDocument.status !== "PROCEDURE_RESOLUTION" ||
      caseDocument.revision !== parsed.expectedRevision
    ) {
      throw new ProcedureResolutionError(
        "STALE_CASE_REVISION",
        "Case is no longer awaiting procedure resolution.",
      );
    }

    const decision = await this.decisionModel
      .findOne({ caseId: caseDocument._id })
      .exec();
    if (!decision)
      throw new ProcedureResolutionError(
        "DECISION_MISSING",
        "Case decision is missing.",
      );
    const institutionResult = caseDocument.institutionId
      ? {
          institution: await this.institutionModel
            .findById(caseDocument.institutionId)
            .exec(),
        }
      : await this.institutionLookup.lookup(decision.institutionName);
    const institution = institutionResult.institution;
    const plan = this.queryBuilder.build({
      caseId: parsed.caseId,
      institutionId: institution?._id.toString() ?? null,
      institutionName: institution?.canonicalName ?? decision.institutionName,
      verifiedOfficialDomains: institution?.verifiedOfficialDomains ?? [],
      relationship: decision.relationship ?? "UNKNOWN",
      decisionType: decision.decisionType ?? "UNKNOWN",
      jurisdictionKey: jurisdictionKey(decision.jurisdiction),
    });

    const cached = await this.cachedProcedure(plan);
    if (cached) {
      const attached = await this.attachIfReady(
        caseDocument,
        cached.procedure,
        cached.version,
        parsed.correlationId,
      );
      return {
        status: attached ? "cached-attached" : "cached-unresolved",
        procedureId: cached.procedure._id.toString(),
        versionId: cached.version._id.toString(),
      };
    }

    const sources = await this.retrieveSources(
      parsed.caseId,
      plan,
      institution,
    );
    if (sources.length === 0) {
      const procedure = await this.upsertProcedure(
        plan,
        institution,
        "UNRESOLVED",
      );
      return {
        status: "unresolved",
        procedureId: procedure._id.toString(),
        versionId: null,
      };
    }

    const extractionInput = {
      caseId: parsed.caseId,
      institutionName: plan.scope.institutionName,
      relationship: plan.scope.relationship ?? "UNKNOWN",
      decisionType: plan.scope.decisionType ?? "UNKNOWN",
      jurisdictionKey: plan.scope.jurisdictionKey,
      sources: sources.map((source) => ({
        sourceSnapshotId: source.snapshot._id.toString(),
        canonicalUrl: source.snapshot.canonicalUrl,
        authorityTier: source.snapshot.authorityTier,
        paragraphs: source.snapshot.paragraphs.map((paragraph) => ({
          paragraphId: paragraph.paragraphId,
          text: paragraph.text,
        })),
      })),
    };
    let extracted: ExtractProcedureOutput;
    try {
      extracted = (await this.ai.extractProcedure(extractionInput)).output;
    } catch (error: unknown) {
      if (isAIProviderError(error)) {
        const procedure = await this.upsertProcedure(
          plan,
          institution,
          "UNRESOLVED",
        );
        return {
          status: "ai-unavailable",
          procedureId: procedure._id.toString(),
          versionId: null,
        };
      }
      throw error;
    }

    const procedure = await this.upsertProcedure(
      plan,
      institution,
      "UNRESOLVED",
    );
    const sourceHashes = sources
      .map(({ snapshot }) => snapshot.contentSha256)
      .sort();
    const contentSha256 = hashInput({ sourceHashes, extracted });
    const previousVersion = procedure.currentVersionId
      ? await this.procedureVersionModel
          .findById(procedure.currentVersionId)
          .exec()
      : null;
    if (previousVersion?.contentSha256 === contentSha256) {
      const attached = await this.attachIfReady(
        caseDocument,
        procedure,
        previousVersion,
        parsed.correlationId,
      );
      return {
        status: attached ? "unchanged-attached" : "unchanged-unresolved",
        procedureId: procedure._id.toString(),
        versionId: previousVersion._id.toString(),
      };
    }

    const version = await this.procedureVersionModel.create({
      procedureId: procedure._id,
      version: (previousVersion?.version ?? 0) + 1,
      previousVersionId: previousVersion?._id ?? null,
      contentSha256,
      scope: plan.scope,
      internalReview: { needsHumanReview: extracted.needsHumanReview },
      deadlines: extracted.deadlines,
      evidenceRequirements: extracted.evidenceRequirements.map((value) => ({
        text: value,
      })),
      steps: extracted.steps,
      escalationRoutes: extracted.escalationRoutes.map((value) => ({
        text: value,
      })),
      submissionCapability: extracted.submissionCapability,
      proceduralClaimIds: [],
      sourceSnapshotIds: sources.map(({ snapshot }) => snapshot._id),
      confidence: 0,
      confidenceFactors: {},
      conflicts: [],
      semanticChangeSummary: previousVersion
        ? "Material source or extracted procedure change detected."
        : null,
      observedAt: new Date(),
    });
    await this.persistSourceChunks(procedure, version, sources);
    const claims = await this.persistClaims(
      parsed.caseId,
      version._id,
      extracted,
      sources,
      extractionInput.sources,
    );
    const conflicts = findConflicts(claims);
    const calculated = this.confidence.calculate({
      authorityTiers: claims.map((claim) => claim.authorityTier),
      verificationStatuses: claims.map((claim) => claim.verificationStatus),
      scopeMatches: scopeMatches(caseDocument, plan),
      freshestAt: newestSourceDate(
        sources.map(({ snapshot }) => snapshot.retrievedAt),
      ),
      conflictCount: conflicts.length,
    });
    const supported = claims.filter(
      (claim) => claim.verificationStatus === "SUPPORTED",
    ).length;
    const ready =
      calculated.confidence >=
        (this.config.get("PROCEDURE_MIN_CONFIDENCE") ?? 0.65) &&
      supported > 0 &&
      conflicts.length === 0 &&
      scopeMatches(caseDocument, plan);
    await this.claimModel.bulkWrite(
      conflicts.flatMap((conflict) =>
        conflict.claimIds.map((claimId) => ({
          updateOne: {
            filter: { _id: claimId },
            update: {
              $set: {
                conflictsWith: conflict.claimIds.filter(
                  (other) => !other.equals(claimId),
                ),
              },
            },
          },
        })),
      ),
    );
    await this.procedureVersionModel
      .findByIdAndUpdate(version._id, {
        $set: {
          proceduralClaimIds: claims.map((claim) => claim._id),
          confidence: calculated.confidence,
          confidenceFactors: calculated.factors,
          conflicts,
        },
      })
      .exec();
    await this.procedureModel
      .findByIdAndUpdate(procedure._id, {
        $set: {
          currentVersionId: version._id,
          status: ready
            ? "ACTIVE"
            : conflicts.length > 0
              ? "CONFLICTED"
              : "UNRESOLVED",
          lastVerifiedAt: new Date(),
        },
      })
      .exec();
    const freshVersion = await this.procedureVersionModel
      .findById(version._id)
      .exec();
    if (!freshVersion)
      throw new ProcedureResolutionError(
        "VERSION_MISSING",
        "Procedure version was not persisted.",
      );
    const attached = await this.attachIfReady(
      caseDocument,
      procedure,
      freshVersion,
      parsed.correlationId,
    );
    return {
      status: attached
        ? "resolved"
        : conflicts.length > 0
          ? "conflicted"
          : "unresolved",
      procedureId: procedure._id.toString(),
      versionId: freshVersion._id.toString(),
    };
  }

  async getForCase(
    userId: string,
    caseId: string,
  ): Promise<Record<string, unknown>> {
    const context = await this.ownerCase(userId, caseId);
    if (!context.activeProcedureId)
      return { procedure: null, version: null, claims: [], sources: [] };
    const procedure = await this.procedureModel
      .findById(context.activeProcedureId)
      .lean()
      .exec();
    if (!procedure) throw new NotFoundException("Procedure not found.");
    const version = context.activeProcedureVersionId
      ? await this.procedureVersionModel
          .findById(context.activeProcedureVersionId)
          .lean()
          .exec()
      : null;
    const claims = version
      ? await this.claimModel
          .find({ procedureVersionId: version._id })
          .sort({ createdAt: 1 })
          .lean()
          .exec()
      : [];
    const sources = version
      ? await this.sourceSnapshotModel
          .find({ _id: { $in: version.sourceSnapshotIds } })
          .sort({ retrievedAt: -1 })
          .lean()
          .exec()
      : [];
    return {
      procedure,
      version,
      claims,
      sources: sources.map((source) => publicSource(source)),
    };
  }

  async sourcesForCase(
    userId: string,
    caseId: string,
  ): Promise<Record<string, unknown>[]> {
    const value = await this.getForCase(userId, caseId);
    return Array.isArray(value.sources)
      ? (value.sources as Record<string, unknown>[])
      : [];
  }

  async claimsForCase(
    userId: string,
    caseId: string,
  ): Promise<Record<string, unknown>[]> {
    const value = await this.getForCase(userId, caseId);
    return Array.isArray(value.claims)
      ? (value.claims as Record<string, unknown>[])
      : [];
  }

  async runsForCase(
    userId: string,
    caseId: string,
  ): Promise<Record<string, unknown>[]> {
    await this.ownerCase(userId, caseId);
    const runs = await this.retrievalRunModel
      .find({ caseId: new Types.ObjectId(caseId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();
    return runs as unknown as Record<string, unknown>[];
  }

  private async retrieveSources(
    caseId: string,
    plan: ProcedureQueryPlan,
    institution:
      import("../cases/schemas/institution.schema").InstitutionDocument | null,
  ): Promise<
    Array<{
      snapshot: import("../retrieval/schemas/source-snapshot.schema").SourceSnapshotDocument;
      score: number;
    }>
  > {
    const candidates: RetrievalSearchResult[] = [];
    let credits = 0;
    const maxCredits =
      this.config.get("TAVILY_MAX_CREDITS_PER_PROCEDURE") ?? 20;
    for (const query of plan.queries.slice(
      0,
      this.config.get("TAVILY_MAX_QUERIES_PER_PROCEDURE") ?? 3,
    )) {
      const started = performance.now();
      const run = await this.startRun(caseId, "SEARCH", [query], {
        includeDomains: plan.includeDomains,
      });
      try {
        const response = await this.tavily.search({
          query,
          maxResults: this.config.get("TAVILY_SEARCH_MAX_RESULTS") ?? 8,
          searchDepth: this.config.get("TAVILY_SEARCH_DEPTH") ?? "advanced",
          includeDomains: plan.includeDomains,
          includeUsage: this.config.get("TAVILY_INCLUDE_USAGE") ?? true,
          timeoutSeconds:
            this.config.get("TAVILY_REQUEST_TIMEOUT_SECONDS") ?? 60,
        });
        credits += response.credits ?? 0;
        candidates.push(...response.results);
        await this.finishRun(
          run._id,
          response.credits,
          Math.round(performance.now() - started),
          response.results.map((result) => result.url),
          response.requestId,
          "SUCCEEDED",
        );
      } catch (error: unknown) {
        await this.failRun(run._id, error);
        throw error;
      }
      if (credits >= maxCredits) break;
    }
    let ranked = candidates
      .map((result) => ({
        result,
        rank: this.authority.rank({
          url: result.url,
          institution,
          jurisdictionKey: plan.scope.jurisdictionKey,
          relationship: plan.scope.relationship ?? "UNKNOWN",
          decisionType: plan.scope.decisionType ?? "UNKNOWN",
          publishedDate: result.publishedDate,
          text: `${result.title} ${result.content}`,
        }),
      }))
      .filter(
        (
          value,
        ): value is {
          result: RetrievalSearchResult;
          rank: NonNullable<ReturnType<AuthorityRankingService["rank"]>>;
        } => value.rank !== null,
      )
      .sort((a, b) => b.rank.score - a.rank.score);
    ranked = ranked.filter(
      (value, index, values) =>
        values.findIndex(
          (other) => other.rank.canonicalUrl === value.rank.canonicalUrl,
        ) === index,
    );
    if (
      ranked.length === 0 &&
      credits < maxCredits &&
      institution?.verifiedOfficialDomains.length
    ) {
      const domain = institution.verifiedOfficialDomains[0];
      if (!domain) return [];
      const mapRun = await this.startRun(caseId, "MAP", [], { domain });
      let mapped;
      try {
        mapped = await this.tavily.map(`https://${domain}`, {
          maxDepth: this.config.get("TAVILY_CRAWL_MAX_DEPTH") ?? 2,
          maxBreadth: this.config.get("TAVILY_CRAWL_MAX_BREADTH") ?? 20,
          limit: this.config.get("TAVILY_CRAWL_MAX_PAGES") ?? 20,
          includeUsage: this.config.get("TAVILY_INCLUDE_USAGE") ?? true,
          timeoutSeconds:
            this.config.get("TAVILY_REQUEST_TIMEOUT_SECONDS") ?? 60,
        });
        credits += mapped.credits ?? 0;
        await this.finishRun(
          mapRun._id,
          mapped.credits,
          mapped.responseTimeSeconds
            ? Math.round(mapped.responseTimeSeconds * 1000)
            : null,
          mapped.urls,
          mapped.requestId,
          "SUCCEEDED",
        );
      } catch (error: unknown) {
        await this.failRun(mapRun._id, error);
        throw error;
      }
      ranked = dedupeUrls(mapped.urls)
        .filter(
          (value) =>
            value.domain === domain || value.domain.endsWith(`.${domain}`),
        )
        .map((value) => ({
          result: {
            title: value.canonicalUrl,
            url: value.canonicalUrl,
            content: "",
            score: 0,
            publishedDate: null,
          },
          rank: this.authority.rank({
            url: value.canonicalUrl,
            institution,
            jurisdictionKey: plan.scope.jurisdictionKey,
            relationship: plan.scope.relationship ?? "UNKNOWN",
            decisionType: plan.scope.decisionType ?? "UNKNOWN",
            text: value.canonicalUrl,
          })!,
        }));
      if (ranked.length === 0 && credits < maxCredits) {
        const crawlRun = await this.startRun(caseId, "CRAWL", [], { domain });
        try {
          const crawled = await this.tavily.crawl(`https://${domain}`, {
            maxDepth: this.config.get("TAVILY_CRAWL_MAX_DEPTH") ?? 2,
            maxBreadth: this.config.get("TAVILY_CRAWL_MAX_BREADTH") ?? 20,
            limit: Math.min(
              this.config.get("TAVILY_CRAWL_MAX_PAGES") ?? 20,
              20,
            ),
            instructions:
              "Find official pages describing appeal, review, suspension, or account decision procedures.",
            selectDomains: [domain],
            includeUsage: this.config.get("TAVILY_INCLUDE_USAGE") ?? true,
            timeoutSeconds: Math.min(
              this.config.get("TAVILY_REQUEST_TIMEOUT_SECONDS") ?? 60,
              150,
            ),
          });
          credits += crawled.credits ?? 0;
          await this.finishRun(
            crawlRun._id,
            crawled.credits,
            crawled.responseTimeSeconds
              ? Math.round(crawled.responseTimeSeconds * 1000)
              : null,
            crawled.results.map((result) => result.url),
            crawled.requestId,
            "SUCCEEDED",
          );
          ranked = dedupeUrls(crawled.results.map((result) => result.url))
            .filter(
              (value) =>
                value.domain === domain || value.domain.endsWith(`.${domain}`),
            )
            .map((value) => ({
              result: {
                title: value.canonicalUrl,
                url: value.canonicalUrl,
                content: "",
                score: 0,
                publishedDate: null,
              },
              rank: this.authority.rank({
                url: value.canonicalUrl,
                institution,
                jurisdictionKey: plan.scope.jurisdictionKey,
                relationship: plan.scope.relationship ?? "UNKNOWN",
                decisionType: plan.scope.decisionType ?? "UNKNOWN",
                text: value.canonicalUrl,
              })!,
            }));
        } catch (error: unknown) {
          await this.failRun(crawlRun._id, error);
          throw error;
        }
      }
    }
    const urls = ranked
      .slice(0, this.config.get("TAVILY_MAX_EXTRACT_PAGES") ?? 8)
      .map((value) => value.rank.canonicalUrl);
    if (urls.length === 0 || credits >= maxCredits) return [];
    const extractRun = await this.startRun(caseId, "EXTRACT", plan.queries, {
      urls,
    });
    try {
      const response = await this.tavily.extract({
        urls,
        query: plan.queries[0] ?? "official appeal procedure",
        extractDepth: this.config.get("TAVILY_EXTRACT_DEPTH") ?? "advanced",
        chunksPerSource: 3,
        includeUsage: this.config.get("TAVILY_INCLUDE_USAGE") ?? true,
        timeoutSeconds: Math.min(
          this.config.get("TAVILY_REQUEST_TIMEOUT_SECONDS") ?? 60,
          60,
        ),
      });
      credits += response.credits ?? 0;
      await this.finishRun(
        extractRun._id,
        response.credits,
        response.responseTimeSeconds
          ? Math.round(response.responseTimeSeconds * 1000)
          : null,
        response.results.map((result) => result.url),
        response.requestId,
        response.failedResults.length ? "PARTIAL" : "SUCCEEDED",
      );
      return this.persistSources(extractRun._id, response.results, ranked);
    } catch (error: unknown) {
      await this.failRun(extractRun._id, error);
      throw error;
    }
  }

  private async persistSources(
    runId: Types.ObjectId,
    results: RetrievalExtractResult[],
    ranked: Array<{
      result: RetrievalSearchResult;
      rank: NonNullable<ReturnType<AuthorityRankingService["rank"]>>;
    }>,
  ): Promise<
    Array<{
      snapshot: import("../retrieval/schemas/source-snapshot.schema").SourceSnapshotDocument;
      score: number;
    }>
  > {
    const output: Array<{
      snapshot: import("../retrieval/schemas/source-snapshot.schema").SourceSnapshotDocument;
      score: number;
    }> = [];
    for (const result of results) {
      const normalized = normalizeUrl(result.url);
      if (!normalized) continue;
      const rank = ranked.find(
        (value) => value.rank.canonicalUrl === normalized.canonicalUrl,
      )?.rank;
      if (!rank) continue;
      const contentSha256 = snapshotContentHash(result.rawContent);
      const paragraphs = normalizeParagraphs(result.rawContent);
      if (paragraphs.length === 0) continue;
      const snapshot = await this.sourceSnapshotModel
        .findOneAndUpdate(
          { canonicalUrl: normalized.canonicalUrl, contentSha256 },
          {
            $setOnInsert: {
              url: result.url,
              canonicalUrl: normalized.canonicalUrl,
              domain: normalized.domain,
              title: result.title,
              authorityTier: rank.authorityTier,
              jurisdiction: null,
              retrievedAt: new Date(),
              contentSha256,
              rawStorageKey: null,
              httpStatus: 200,
              retrievalProvider: "tavily",
              retrievalRunId: runId,
              paragraphs,
              status: "RETRIEVED",
              metadata: {
                authorityScore: rank.score,
                authorityFactors: rank.factors,
              },
            },
          },
          { upsert: true, new: true },
        )
        .exec();
      if (snapshot) output.push({ snapshot, score: rank.score });
    }
    await this.retrievalRunModel
      .updateOne(
        { _id: runId },
        {
          $set: {
            sourceSnapshotIds: output.map(({ snapshot }) => snapshot._id),
          },
        },
      )
      .exec();
    return output;
  }

  private async persistSourceChunks(
    procedure: import("./schemas/procedure.schema").ProcedureDocument,
    version: import("./schemas/procedure-version.schema").ProcedureVersionDocument,
    sources: Array<{
      snapshot: import("../retrieval/schemas/source-snapshot.schema").SourceSnapshotDocument;
      score: number;
    }>,
  ): Promise<void> {
    const definitions = sources.flatMap(({ snapshot }) =>
      snapshot.paragraphs.map((paragraph) => ({
        authorityTier: snapshot.authorityTier,
        canonicalUrl: snapshot.canonicalUrl,
        contentSha256: snapshot.contentSha256,
        institutionId: procedure.institutionId,
        jurisdictionKey: procedure.jurisdictionKey,
        normalizedText: paragraph.text
          .trim()
          .replace(/\s+/gu, " ")
          .toLowerCase(),
        ordinal: paragraph.ordinal,
        paragraphId: paragraph.paragraphId,
        procedureId: procedure._id,
        procedureVersionId: version._id,
        sourceSnapshotId: snapshot._id,
        text: paragraph.text,
      })),
    );
    if (definitions.length === 0) return;
    await this.sourceChunkModel.bulkWrite(
      definitions.map((definition) => ({
        updateOne: {
          filter: {
            paragraphId: definition.paragraphId,
            sourceSnapshotId: definition.sourceSnapshotId,
          },
          update: { $setOnInsert: definition },
          upsert: true,
        },
      })),
    );
    if (!this.config.get("EMBEDDING_API_KEY")) return;
    const chunks = await this.sourceChunkModel
      .find({ procedureVersionId: version._id })
      .sort({ ordinal: 1, _id: 1 })
      .exec();
    const pending = chunks.filter(
      (chunk) => chunk.embeddingHash !== digestText(chunk.normalizedText),
    );
    if (pending.length === 0) return;
    const vectors = await this.embeddings.embedDocuments(
      pending.map((chunk) => chunk.normalizedText),
    );
    await Promise.all(
      pending.map((chunk, index) => {
        const embedding = vectors[index];
        if (!embedding) return Promise.resolve();
        return this.sourceChunkModel
          .updateOne(
            { _id: chunk._id, procedureVersionId: version._id },
            {
              $set: {
                embeddedAt: new Date(),
                embedding,
                embeddingDimensions: embedding.length,
                embeddingHash: digestText(chunk.normalizedText),
                embeddingModel:
                  this.config.get("EMBEDDING_MODEL") ?? "voyage-4-lite",
                embeddingProvider:
                  this.config.get("EMBEDDING_PROVIDER") ?? "voyage",
              },
            },
          )
          .exec()
          .then(() => undefined);
      }),
    );
  }

  private async persistClaims(
    caseId: string,
    versionId: Types.ObjectId,
    extracted: ExtractProcedureOutput,
    sources: Array<{
      snapshot: import("../retrieval/schemas/source-snapshot.schema").SourceSnapshotDocument;
      score: number;
    }>,
    aiSources: Array<{
      sourceSnapshotId: string;
      canonicalUrl: string;
      authorityTier: SourceAuthorityTier;
      paragraphs: Array<{ paragraphId: string; text: string }>;
    }>,
  ): Promise<
    import("../procedure/schemas/procedural-claim.schema").ProceduralClaimDocument[]
  > {
    const maxClaims = this.config.get("PROCEDURE_MAX_CLAIMS") ?? 50;
    const claims: import("../procedure/schemas/procedural-claim.schema").ProceduralClaimDocument[] =
      [];
    const seenClaimKeys = new Set<string>();
    for (const extractedClaim of extracted.claims.slice(0, maxClaims)) {
      if (seenClaimKeys.has(extractedClaim.claimKey)) continue;
      seenClaimKeys.add(extractedClaim.claimKey);
      const source = sources.find(
        ({ snapshot }) =>
          snapshot._id.toString() === extractedClaim.sourceSnapshotId,
      );
      if (!source) continue;
      let supportSnapshot = source.snapshot;
      let supportParagraphIds = extractedClaim.paragraphIds;
      let authorityTier = supportSnapshot.authorityTier;
      let status: ProceduralClaimVerificationStatus = authorityTier.startsWith(
        "TIER_1",
      )
        ? "NOT_FOUND"
        : "UNVERIFIED";
      let explanation: string | null = authorityTier.startsWith("TIER_1")
        ? null
        : "Source was extracted but is not a trusted Tier 1 authority.";
      let verifierRunId: Types.ObjectId | null = null;
      if (authorityTier.startsWith("TIER_1")) {
        try {
          const verified = await this.ai.verifyProceduralClaim({
            caseId,
            claimText: extractedClaim.humanText,
            claimType: extractedClaim.type,
            sources: aiSources,
          });
          status = verified.output.verificationStatus;
          explanation = verified.output.explanation;
          verifierRunId = verified.run._id;
          if (verified.output.supportingSourceSnapshotId) {
            const verifiedSource = sources.find(
              ({ snapshot }) =>
                snapshot._id.toString() ===
                verified.output.supportingSourceSnapshotId,
            );
            if (verifiedSource) {
              supportSnapshot = verifiedSource.snapshot;
              authorityTier = supportSnapshot.authorityTier;
              if (verified.output.supportingParagraphIds.length > 0) {
                supportParagraphIds = verified.output.supportingParagraphIds;
              }
            }
          }
        } catch (error: unknown) {
          if (!isAIProviderError(error)) throw error;
          explanation =
            "Verification provider unavailable; the claim remains unverified.";
        }
      }
      const created = await this.claimModel.create({
        procedureVersionId: versionId,
        claimKey: extractedClaim.claimKey,
        type: extractedClaim.type,
        humanText: extractedClaim.humanText,
        normalizedValue: extractedClaim.normalizedValue
          ? { value: extractedClaim.normalizedValue }
          : {},
        verificationStatus: status,
        verificationExplanation: explanation,
        confidence: extractedClaim.confidence,
        authorityTier,
        support: [
          {
            sourceSnapshotId: supportSnapshot._id,
            paragraphIds: supportParagraphIds,
            verifierRunId,
          },
        ],
        conflictsWith: [],
      });
      claims.push(created);
    }
    return claims;
  }

  private async cachedProcedure(plan: ProcedureQueryPlan): Promise<{
    procedure: import("./schemas/procedure.schema").ProcedureDocument;
    version: import("./schemas/procedure-version.schema").ProcedureVersionDocument;
  } | null> {
    const procedure = await this.procedureModel
      .findOne({
        scopeKey: plan.scopeKey,
        status: { $in: ["ACTIVE", "CONFLICTED"] },
      })
      .exec();
    if (!procedure?.currentVersionId || !procedure.lastVerifiedAt) return null;
    const ageHours =
      (Date.now() - procedure.lastVerifiedAt.getTime()) / 3_600_000;
    if (ageHours > (this.config.get("PROCEDURE_CACHE_TTL_HOURS") ?? 24)) {
      if (
        ageHours > (this.config.get("PROCEDURE_STALE_AFTER_HOURS") ?? 168) &&
        procedure.status !== "STALE"
      )
        await this.procedureModel
          .updateOne({ _id: procedure._id }, { $set: { status: "STALE" } })
          .exec();
      return null;
    }
    const version = await this.procedureVersionModel
      .findById(procedure.currentVersionId)
      .exec();
    return version ? { procedure, version } : null;
  }

  private async upsertProcedure(
    plan: ProcedureQueryPlan,
    institution:
      import("../cases/schemas/institution.schema").InstitutionDocument | null,
    status: "ACTIVE" | "UNRESOLVED",
  ): Promise<import("./schemas/procedure.schema").ProcedureDocument> {
    return this.procedureModel
      .findOneAndUpdate(
        { scopeKey: plan.scopeKey },
        {
          $setOnInsert: {
            institutionId: institution?._id ?? null,
            institutionName: plan.scope.institutionName,
            relationship: plan.scope.relationship ?? "UNKNOWN",
            decisionType: plan.scope.decisionType ?? "UNKNOWN",
            jurisdictionKey: plan.scope.jurisdictionKey,
            scopeKey: plan.scopeKey,
            currentVersionId: null,
            status,
            firstSeenAt: new Date(),
            lastVerifiedAt: null,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  private async attachIfReady(
    caseDocument: import("../cases/schemas/case.schema").CaseDocument,
    procedure: import("./schemas/procedure.schema").ProcedureDocument,
    version: import("./schemas/procedure-version.schema").ProcedureVersionDocument,
    correlationId: string | null,
  ): Promise<boolean> {
    if (!scopeMatches(caseDocument, procedure)) return false;
    if (
      procedure.status !== "ACTIVE" ||
      version.confidence < (this.config.get("PROCEDURE_MIN_CONFIDENCE") ?? 0.65)
    )
      return false;
    if (caseDocument.status !== "PROCEDURE_RESOLUTION") return false;
    await this.stateMachine.transition(
      caseDocument._id.toString(),
      "EVIDENCE_COLLECTION",
      {
        actorId: null,
        actorType: "SYSTEM",
        correlationId: correlationId ?? undefined,
      },
      {
        expectedCurrent: ["PROCEDURE_RESOLUTION"],
        expectedRevision: caseDocument.revision,
        eventType: "PROCEDURE_RESOLVED",
        idempotencyKey: `procedure-resolved-${caseDocument._id.toString()}-${version._id.toString()}`,
        payload: {
          procedureId: procedure._id.toString(),
          procedureVersionId: version._id.toString(),
          confidence: version.confidence,
        },
        setFields: {
          activeProcedureId: procedure._id,
          activeProcedureVersionId: version._id,
        },
      },
    );
    return true;
  }

  private async ownerCase(
    userId: string,
    caseId: string,
  ): Promise<import("../cases/schemas/case.schema").CaseDocument> {
    if (!isValidObjectId(caseId) || !isValidObjectId(userId))
      throw new NotFoundException("Case not found.");
    const value = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(caseId),
        ownerId: new Types.ObjectId(userId),
        deletedAt: null,
      })
      .exec();
    if (!value)
      throw new ForbiddenException("You do not have access to this case.");
    return value;
  }

  private async startRun(
    caseId: string,
    operation: "SEARCH" | "EXTRACT" | "MAP" | "CRAWL",
    queries: string[],
    filters: Record<string, unknown>,
  ): Promise<
    import("../retrieval/schemas/retrieval-run.schema").RetrievalRunDocument
  > {
    return this.retrievalRunModel.create({
      caseId: new Types.ObjectId(caseId),
      operation,
      provider: "tavily",
      queries,
      filters,
      resultUrls: [],
      sourceSnapshotIds: [],
      creditsOrCost: null,
      latencyMs: null,
      providerRequestId: null,
      status: "RUNNING",
      errorCode: null,
      errorMessage: null,
    });
  }

  private async finishRun(
    id: Types.ObjectId,
    credits: number | null,
    latencyMs: number | null,
    urls: string[],
    requestId: string | null,
    status: "SUCCEEDED" | "PARTIAL",
  ): Promise<void> {
    await this.retrievalRunModel
      .updateOne(
        { _id: id },
        {
          $set: {
            creditsOrCost: credits,
            latencyMs,
            resultUrls: urls,
            providerRequestId: requestId,
            status,
          },
        },
      )
      .exec();
  }

  private async failRun(id: Types.ObjectId, error: unknown): Promise<void> {
    const typed = error as { code?: unknown; message?: unknown };
    await this.retrievalRunModel
      .updateOne(
        { _id: id },
        {
          $set: {
            status: "FAILED",
            errorCode:
              typeof typed.code === "string" ? typed.code : "RETRIEVAL_FAILED",
            errorMessage:
              typeof typed.message === "string"
                ? typed.message.slice(0, 500)
                : "Retrieval failed.",
          },
        },
      )
      .exec();
  }
}

function normalizeParagraphs(
  content: string,
): Array<{ paragraphId: string; ordinal: number; text: string }> {
  return content
    .split(/\n\s*\n/)
    .map((value) =>
      value
        .replace(/^#+\s*/gm, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((value) => value.length > 10)
    .slice(0, 100)
    .map((text, ordinal) => ({
      paragraphId: `p-${ordinal}-${createHash("sha256").update(text).digest("hex").slice(0, 12)}`,
      ordinal,
      text,
    }));
}

export function isProcedureCacheFresh(
  lastVerifiedAt: Date,
  now: Date,
  cacheTtlHours: number,
): boolean {
  return now.getTime() - lastVerifiedAt.getTime() <= cacheTtlHours * 3_600_000;
}

export function snapshotContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function procedureNeedsRefresh(
  lastVerifiedAt: Date,
  now: Date,
  staleAfterHours: number,
): boolean {
  return now.getTime() - lastVerifiedAt.getTime() > staleAfterHours * 3_600_000;
}

function jurisdictionKey(
  value: { countryCode: string | null; regionCode: string | null } | null,
): string | null {
  if (!value) return null;
  return (
    [value.countryCode, value.regionCode].filter(Boolean).join(":") || null
  );
}

function scopeMatches(
  caseDocument: import("../cases/schemas/case.schema").CaseDocument,
  scopeOwner:
    | { scope: Record<string, unknown> }
    | {
        institutionId: Types.ObjectId | null;
        relationship: string;
        decisionType: string;
      },
): boolean {
  const scope = "scope" in scopeOwner ? scopeOwner.scope : scopeOwner;
  const institutionId = "institutionId" in scope ? scope.institutionId : null;
  return Boolean(
    caseDocument.institutionId &&
    institutionId &&
    caseDocument.institutionId.toString() ===
      (typeof institutionId === "string"
        ? institutionId
        : institutionId.toString()) &&
    caseDocument.relationship === scope.relationship &&
    caseDocument.decisionType === scope.decisionType,
  );
}

function newestSourceDate(dates: Date[]): Date | null {
  return dates.reduce<Date | null>(
    (latest, date) => (!latest || date > latest ? date : latest),
    null,
  );
}

export function findConflicts(
  claims: Array<{
    _id: Types.ObjectId;
    type: string;
    normalizedValue: Record<string, unknown>;
  }>,
): Array<{ type: string; claimIds: Types.ObjectId[] }> {
  const byType = new Map<
    string,
    Array<{ id: Types.ObjectId; value: string }>
  >();
  for (const claim of claims) {
    const value = JSON.stringify(claim.normalizedValue);
    const values = byType.get(claim.type) ?? [];
    values.push({ id: claim._id, value });
    byType.set(claim.type, values);
  }
  return [...byType.entries()].flatMap(([type, values]) => {
    const distinct = new Set(values.map((value) => value.value));
    return distinct.size > 1
      ? [{ type, claimIds: values.map((value) => value.id) }]
      : [];
  });
}

function isAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError;
}

function publicSource(source: {
  _id: unknown;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  authorityTier: SourceAuthorityTier;
  jurisdiction: string | null;
  retrievedAt: Date;
  contentSha256: string;
  paragraphs: unknown;
  metadata: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: source._id,
    canonicalUrl: source.canonicalUrl,
    domain: source.domain,
    title: source.title,
    authorityTier: source.authorityTier,
    jurisdiction: source.jurisdiction,
    retrievedAt: source.retrievedAt,
    contentSha256: source.contentSha256,
    paragraphs: source.paragraphs,
    metadata: source.metadata,
  };
}

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
