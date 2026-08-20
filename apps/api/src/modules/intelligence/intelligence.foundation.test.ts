import { ConfigService } from "@nestjs/config";
import { Model, Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { type EnvironmentConfig } from "@recourse/config";

import { type EmbeddingProvider } from "../embeddings/embedding.types";
import { Case } from "../cases/schemas/case.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";
import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
import { claimDedupKey } from "./claim.service";
import {
  candidatePairs,
  deterministicConflictStatus,
} from "./contradiction.service";
import { HybridRetrievalService } from "./hybrid-retrieval.service";
import { READINESS_VERSION, ReadinessService } from "./readiness.service";
import { GraphService } from "./graph.service";
import { Claim } from "./schemas/claim.schema";
import { Contradiction } from "./schemas/contradiction.schema";
import { EvidenceRequirementMatch } from "./schemas/evidence-requirement-match.schema";
import { GraphEdge } from "./schemas/graph-edge.schema";
import { GraphNode } from "./schemas/graph-node.schema";
import { TimelineEvent } from "./schemas/timeline-event.schema";
import { type ClaimDocument } from "./schemas/claim.schema";
import { type EvidenceRequirementMatchDocument } from "./schemas/evidence-requirement-match.schema";
import { Procedure } from "../procedure/schemas/procedure.schema";
import { ProcedureVersion } from "../procedure/schemas/procedure-version.schema";
import { ProceduralClaim } from "../procedure/schemas/procedural-claim.schema";
import { ProcedureSourceChunk } from "../procedure/schemas/procedure-source-chunk.schema";

describe("evidence intelligence foundations", () => {
  it("requires the case filter on both vector and lexical private retrieval", async () => {
    const caseId = new Types.ObjectId();
    const model = new AggregateModel<EvidenceBlock>([
      {
        _id: new Types.ObjectId(),
        evidenceId: new Types.ObjectId(),
        score: 0.9,
        text: "order 123",
      } as unknown as EvidenceBlock,
    ]);
    const service = new HybridRetrievalService(
      model as unknown as Model<EvidenceBlock>,
      model as unknown as Model<ProcedureSourceChunk>,
      new TestEmbeddingProvider(),
      config(),
    );

    const results = await service.searchEvidence(
      caseId.toString(),
      "order 123",
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe("order 123");
    const vectorStage = model.pipelines.find((pipeline) =>
      Boolean(pipeline[0] && "$vectorSearch" in pipeline[0]),
    );
    const lexicalStage = model.pipelines.find((pipeline) =>
      Boolean(pipeline[0] && "$search" in pipeline[0]),
    );
    const vectorSearch = vectorStage?.[0]?.["$vectorSearch"] as
      { filter: { caseId: Types.ObjectId } } | undefined;
    const search = lexicalStage?.[0]?.["$search"] as
      | {
          compound: {
            filter: Array<{ equals: { value: Types.ObjectId } }>;
          };
        }
      | undefined;
    expect(vectorSearch?.filter.caseId).toEqual(caseId);
    expect(search?.compound.filter[0]?.equals.value).toEqual(caseId);
  });

  it("fuses semantic and lexical matches deterministically", async () => {
    const model = new AggregateModel<EvidenceBlock>([
      {
        _id: new Types.ObjectId("507f1f77bcf86cd799439011"),
        evidenceId: new Types.ObjectId("507f1f77bcf86cd799439012"),
        score: 0.8,
        text: "shared result",
      } as unknown as EvidenceBlock,
      {
        _id: new Types.ObjectId("507f1f77bcf86cd799439013"),
        evidenceId: new Types.ObjectId("507f1f77bcf86cd799439014"),
        score: 0.7,
        text: "lexical-only result",
      } as unknown as EvidenceBlock,
    ]);
    const service = new HybridRetrievalService(
      model as unknown as Model<EvidenceBlock>,
      model as unknown as Model<ProcedureSourceChunk>,
      new TestEmbeddingProvider(),
      config(),
    );
    const results = await service.searchEvidence(
      new Types.ObjectId().toString(),
      "identifier",
      { limit: 10 },
    );

    expect(results.map((result) => result.text)).toEqual([
      "shared result",
      "lexical-only result",
    ]);
    expect(results[0]).toMatchObject({
      lexicalScore: 0.8,
      vectorScore: 0.8,
    });
  });

  it("resolves a weaker conflicting assertion but keeps equal-strength conflicts open", () => {
    expect(
      deterministicConflictStatus("VERIFIED_DOCUMENT", "USER_ASSERTED"),
    ).toBe("EXPLAINABLE");
    expect(
      deterministicConflictStatus("VERIFIED_DOCUMENT", "EXTERNAL_VERIFIED"),
    ).toBe("OPEN");
  });

  it("never treats alternate extractions from the same source block as contradictions", () => {
    const sharedSource = {
      location: null,
      sourceId: new Types.ObjectId().toString(),
      sourceType: "EVIDENCE_BLOCK" as const,
    };
    const claims = [
      {
        normalizedType: "DATE",
        normalizedValue: "August 18, 2026",
        sourceRefs: [sharedSource],
      },
      {
        normalizedType: "DATE",
        normalizedValue: "August 19, 2026",
        sourceRefs: [sharedSource],
      },
    ] as ClaimDocument[];

    expect(candidatePairs(claims)).toEqual([]);
  });

  it("uses deterministic readiness caps for missing critical requirements", () => {
    const service = new ReadinessService({} as Model<Case>);
    const result = service.calculate({
      caseDocument: {
        jurisdiction: { countryCode: "NG", source: "USER" },
      } as Case,
      claims: [verifiedClaim()],
      contradictions: [],
      procedure: { status: "ACTIVE" } as Procedure,
      procedureVersion: { confidence: 0.9 } as ProcedureVersion,
      requirements: [
        {
          critical: true,
          status: "MISSING",
        } as unknown as EvidenceRequirementMatchDocument,
      ],
      timeline: [],
    });

    expect(result.version).toBe(READINESS_VERSION);
    expect(result.caps).toContain("CRITICAL_REQUIREMENT_GAP");
    expect(result.score).toBeLessThanOrEqual(59);
  });

  it("produces repeatable readiness scores for the same inputs", () => {
    const service = new ReadinessService({} as Model<Case>);
    const input = {
      caseDocument: {
        jurisdiction: { countryCode: "NG", source: "CATALOG" },
      } as Case,
      claims: [verifiedClaim()],
      contradictions: [],
      procedure: { status: "ACTIVE" } as Procedure,
      procedureVersion: { confidence: 0.9 } as ProcedureVersion,
      requirements: [
        {
          critical: true,
          status: "SATISFIED",
        } as unknown as EvidenceRequirementMatchDocument,
      ],
      timeline: [],
    };
    const first = service.calculate(input, new Date("2026-01-01T00:00:00Z"));
    const second = service.calculate(input, new Date("2026-01-01T00:00:00Z"));

    expect(second).toEqual(first);
  });

  it("uses versioned graph rebuilds and removes stale versions", async () => {
    const caseDocument = {
      _id: new Types.ObjectId(),
      activeProcedureId: null,
      activeProcedureVersionId: null,
      caseKey: "RC-TEST",
      deletedAt: null,
      graphVersion: 1,
      title: "Graph test",
    } as unknown as Case & { _id: Types.ObjectId };
    const evidence = {
      _id: new Types.ObjectId(),
      caseId: caseDocument._id,
      kind: "DECISION_NOTICE",
      label: "Notice",
      originalFilename: "notice.pdf",
      processingStatus: "READY",
    };
    const nodeUpdates: number[] = [];
    const edgeUpdates: number[] = [];
    const nodeModel = new GraphPersistenceFake(nodeUpdates);
    const edgeModel = new GraphPersistenceFake(edgeUpdates);
    const caseModel = {
      findOne: () => query(caseDocument),
      updateOne: (
        _filter: unknown,
        update: { $set?: { graphVersion?: number } },
      ) => {
        if (update.$set?.graphVersion)
          caseDocument.graphVersion = update.$set.graphVersion;
        return query({ acknowledged: true });
      },
    };
    const service = new GraphService(
      caseModel as unknown as Model<Case>,
      collection([evidence]) as unknown as Model<Evidence>,
      collection([]) as unknown as Model<EvidenceBlock>,
      collection([]) as unknown as Model<Claim>,
      collection([]) as unknown as Model<TimelineEvent>,
      collection([]) as unknown as Model<Contradiction>,
      collection([]) as unknown as Model<EvidenceRequirementMatch>,
      collection([]) as unknown as Model<Procedure>,
      collection([]) as unknown as Model<ProcedureVersion>,
      collection([]) as unknown as Model<ProceduralClaim>,
      nodeModel as unknown as Model<GraphNode>,
      edgeModel as unknown as Model<GraphEdge>,
      {
        withOwnerScope: (_ownerId: string, filter: Record<string, unknown>) =>
          filter,
      } as never,
    );

    const first = await service.rebuild(caseDocument._id.toString());
    const second = await service.rebuild(caseDocument._id.toString());

    expect(first.version).toBe(2);
    expect(second.version).toBe(3);
    expect(nodeUpdates).toEqual([1, 2, 3, 4]);
    expect(edgeUpdates).toEqual([1, 2]);
    expect(nodeModel.deletedVersions).toEqual([2, 3]);
  });

  it("deduplicates claims by normalized fact while retaining the full text fallback", () => {
    expect(claimDedupKey("ENTITY_NAME", "acme platform", "Acme Platform")).toBe(
      claimDedupKey("ENTITY_NAME", "acme platform", "different wording"),
    );
    expect(claimDedupKey(null, null, "same normalized text")).toBe(
      claimDedupKey(null, null, "same normalized text"),
    );
  });
});

class TestEmbeddingProvider implements EmbeddingProvider {
  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.2]);
  }

  async embedQuery(): Promise<number[]> {
    return [0.1, 0.2];
  }

  async healthCheck(): Promise<{
    configured: boolean;
    provider: string;
    model: string;
  }> {
    return { configured: true, model: "test", provider: "test" };
  }
}

class AggregateModel<T> {
  readonly pipelines: Array<Record<string, unknown>[]> = [];

  constructor(private readonly rows: T[]) {}

  aggregate(pipeline: Array<Record<string, unknown>>): Promise<T[]> {
    this.pipelines.push(pipeline);
    return Promise.resolve(this.rows);
  }
}

class GraphPersistenceFake {
  readonly deletedVersions: number[] = [];
  private sequence = 0;

  constructor(private readonly updates: number[]) {}

  findOneAndUpdate(): ReturnType<typeof query> {
    this.sequence += 1;
    const id = new Types.ObjectId();
    this.updates.push(this.sequence);
    return query({ _id: id });
  }

  deleteMany(filter: { version?: { $lt?: number } }): ReturnType<typeof query> {
    if (filter.version?.$lt) this.deletedVersions.push(filter.version.$lt);
    return query({ acknowledged: true });
  }
}

function collection<T>(items: T[]): {
  find: () => ReturnType<typeof query>;
} {
  return { find: () => query(items) };
}

function query<T>(value: T): {
  sort: () => ReturnType<typeof query<T>>;
  exec: () => Promise<T>;
} {
  return {
    exec: () => Promise.resolve(value),
    sort: () => query(value),
  };
}

function config(): ConfigService<EnvironmentConfig> {
  return new ConfigService<EnvironmentConfig>({
    VECTOR_SEARCH_INDEX_EVIDENCE: "evidence_blocks_vector",
    VECTOR_SEARCH_INDEX_PROCEDURE: "procedure_source_chunks_vector",
    ATLAS_SEARCH_INDEX_EVIDENCE: "evidence_blocks_lexical",
    ATLAS_SEARCH_INDEX_PROCEDURE: "procedure_source_chunks_lexical",
    VECTOR_SEARCH_NUM_CANDIDATES: 20,
    VECTOR_SEARCH_LIMIT: 20,
  });
}

function verifiedClaim(): ClaimDocument {
  return {
    _id: new Types.ObjectId(),
    caseId: new Types.ObjectId(),
    confidence: 0.9,
    normalizedValue: "verified",
    sourceRefs: [],
    status: "VERIFIED_DOCUMENT",
  } as unknown as ClaimDocument;
}
