import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";

import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
import { ProcedureSourceChunk } from "../procedure/schemas/procedure-source-chunk.schema";
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from "../embeddings/embedding.types";

export interface HybridSearchResult {
  id: string;
  text: string;
  score: number;
  vectorScore: number | null;
  lexicalScore: number | null;
  sourceId: string;
}

@Injectable()
export class HybridRetrievalService {
  constructor(
    @InjectModel(EvidenceBlock.name)
    private readonly evidenceBlockModel: Model<EvidenceBlock>,
    @InjectModel(ProcedureSourceChunk.name)
    private readonly procedureChunkModel: Model<ProcedureSourceChunk>,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
    private readonly config: ConfigService<EnvironmentConfig>,
  ) {}

  async searchEvidence(
    caseId: string,
    query: string,
    options: { limit?: number } = {},
  ): Promise<HybridSearchResult[]> {
    const objectId = this.caseObjectId(caseId);
    const text = this.queryText(query);
    const limit = Math.min(
      options.limit ?? this.config.get("VECTOR_SEARCH_LIMIT") ?? 20,
      100,
    );
    const [vector, lexical] = await Promise.all([
      this.vectorEvidence(objectId, text, limit),
      this.lexicalEvidence(objectId, text, limit),
    ]);
    return fuseResults(vector, lexical, limit);
  }

  async searchProcedureSources(
    scope: {
      institutionId: string | null;
      jurisdictionKey: string | null;
      procedureId?: string | null;
      procedureVersionId?: string | null;
      authorityTiers?: string[];
    },
    query: string,
    options: { limit?: number } = {},
  ): Promise<HybridSearchResult[]> {
    const text = this.queryText(query);
    const limit = Math.min(
      options.limit ?? this.config.get("VECTOR_SEARCH_LIMIT") ?? 20,
      100,
    );
    const [vector, lexical] = await Promise.all([
      this.vectorProcedure(scope, text, limit),
      this.lexicalProcedure(scope, text, limit),
    ]);
    return fuseResults(vector, lexical, limit);
  }

  private async vectorEvidence(
    caseId: Types.ObjectId,
    query: string,
    limit: number,
  ): Promise<RankedRow[]> {
    const vector = await this.embeddings.embedQuery(query);
    return this.evidenceBlockModel.aggregate<RankedRow>([
      {
        $vectorSearch: {
          filter: { caseId },
          index:
            this.config.get("VECTOR_SEARCH_INDEX_EVIDENCE") ??
            "evidence_blocks_vector",
          limit,
          numCandidates: this.config.get("VECTOR_SEARCH_NUM_CANDIDATES") ?? 200,
          path: "embedding",
          queryVector: vector,
        },
      },
      {
        $project: {
          _id: 1,
          caseId: 1,
          evidenceId: 1,
          score: { $meta: "vectorSearchScore" },
          text: 1,
        },
      },
    ]);
  }

  private async lexicalEvidence(
    caseId: Types.ObjectId,
    query: string,
    limit: number,
  ): Promise<RankedRow[]> {
    return this.evidenceBlockModel.aggregate<RankedRow>([
      {
        $search: {
          compound: {
            filter: [{ equals: { path: "caseId", value: caseId } }],
            must: [
              {
                text: {
                  query,
                  path: ["text", "normalizedText"],
                },
              },
            ],
          },
          index:
            this.config.get("ATLAS_SEARCH_INDEX_EVIDENCE") ??
            "evidence_blocks_lexical",
        },
      },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          caseId: 1,
          evidenceId: 1,
          score: { $meta: "searchScore" },
          text: 1,
        },
      },
    ]);
  }

  private async vectorProcedure(
    scope: ProcedureScope,
    query: string,
    limit: number,
  ): Promise<RankedRow[]> {
    const vector = await this.embeddings.embedQuery(query);
    return this.procedureChunkModel.aggregate<RankedRow>([
      {
        $vectorSearch: {
          filter: procedureFilter(scope),
          index:
            this.config.get("VECTOR_SEARCH_INDEX_PROCEDURE") ??
            "procedure_source_chunks_vector",
          limit,
          numCandidates: this.config.get("VECTOR_SEARCH_NUM_CANDIDATES") ?? 200,
          path: "embedding",
          queryVector: vector,
        },
      },
      {
        $project: {
          _id: 1,
          procedureVersionId: 1,
          score: { $meta: "vectorSearchScore" },
          sourceSnapshotId: 1,
          text: 1,
        },
      },
    ]);
  }

  private async lexicalProcedure(
    scope: ProcedureScope,
    query: string,
    limit: number,
  ): Promise<RankedRow[]> {
    return this.procedureChunkModel.aggregate<RankedRow>([
      {
        $search: {
          compound: {
            filter: procedureFilter(scope, true),
            must: [
              {
                text: {
                  query,
                  path: ["text", "normalizedText"],
                },
              },
            ],
          },
          index:
            this.config.get("ATLAS_SEARCH_INDEX_PROCEDURE") ??
            "procedure_source_chunks_lexical",
        },
      },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          procedureVersionId: 1,
          score: { $meta: "searchScore" },
          sourceSnapshotId: 1,
          text: 1,
        },
      },
    ]);
  }

  private caseObjectId(caseId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException("caseId is invalid.");
    }
    return new Types.ObjectId(caseId);
  }

  private queryText(query: string): string {
    const text = query.trim();
    if (!text || text.length > 4000) {
      throw new BadRequestException("Search query is invalid.");
    }
    return text;
  }
}

interface RankedRow {
  _id: Types.ObjectId;
  text: string;
  score?: number;
  evidenceId?: Types.ObjectId;
  sourceSnapshotId?: Types.ObjectId;
  procedureVersionId?: Types.ObjectId | null;
}

interface ProcedureScope {
  institutionId: string | null;
  jurisdictionKey: string | null;
  procedureId?: string | null;
  procedureVersionId?: string | null;
  authorityTiers?: string[];
}

function procedureFilter(
  scope: ProcedureScope,
  forSearch = false,
): Record<string, unknown>[] {
  const filters: Record<string, unknown>[] = [];
  if (scope.institutionId && Types.ObjectId.isValid(scope.institutionId)) {
    filters.push({
      equals: {
        path: "institutionId",
        value: new Types.ObjectId(scope.institutionId),
      },
    });
  }
  if (scope.jurisdictionKey) {
    filters.push({
      equals: { path: "jurisdictionKey", value: scope.jurisdictionKey },
    });
  }
  if (scope.procedureId && Types.ObjectId.isValid(scope.procedureId)) {
    filters.push({
      equals: {
        path: "procedureId",
        value: new Types.ObjectId(scope.procedureId),
      },
    });
  }
  if (
    scope.procedureVersionId &&
    Types.ObjectId.isValid(scope.procedureVersionId)
  ) {
    filters.push({
      equals: {
        path: "procedureVersionId",
        value: new Types.ObjectId(scope.procedureVersionId),
      },
    });
  }
  if (scope.authorityTiers?.length) {
    filters.push({
      in: { path: "authorityTier", value: scope.authorityTiers },
    });
  }
  return forSearch ? filters : filters;
}

function fuseResults(
  vector: RankedRow[],
  lexical: RankedRow[],
  limit: number,
): HybridSearchResult[] {
  const merged = new Map<
    string,
    {
      row: RankedRow;
      vectorScore: number | null;
      lexicalScore: number | null;
      score: number;
    }
  >();
  const add = (rows: RankedRow[], type: "vector" | "lexical"): void => {
    rows.forEach((row, index) => {
      const id = row._id.toString();
      const existing = merged.get(id) ?? {
        lexicalScore: null,
        row,
        score: 0,
        vectorScore: null,
      };
      const rankScore = 1 / (60 + index + 1);
      existing.score += rankScore;
      if (type === "vector") existing.vectorScore = row.score ?? null;
      else existing.lexicalScore = row.score ?? null;
      merged.set(id, existing);
    });
  };
  add(vector, "vector");
  add(lexical, "lexical");
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((value) => ({
      id: value.row._id.toString(),
      lexicalScore: value.lexicalScore,
      score: Number(value.score.toFixed(6)),
      sourceId: (
        value.row.evidenceId ??
        value.row.sourceSnapshotId ??
        value.row._id
      ).toString(),
      text: value.row.text,
      vectorScore: value.vectorScore,
    }));
}
