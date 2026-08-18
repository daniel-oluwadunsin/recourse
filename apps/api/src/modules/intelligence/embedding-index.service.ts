import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";

import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from "../embeddings/embedding.types";
import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
import { ProcedureSourceChunk } from "../procedure/schemas/procedure-source-chunk.schema";

@Injectable()
export class EmbeddingIndexService {
  constructor(
    @InjectModel(EvidenceBlock.name)
    private readonly evidenceBlockModel: Model<EvidenceBlock>,
    @InjectModel(ProcedureSourceChunk.name)
    private readonly procedureChunkModel: Model<ProcedureSourceChunk>,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddings: EmbeddingProvider,
    private readonly config: ConfigService<EnvironmentConfig>,
  ) {}

  async indexEvidenceBlocks(caseId: Types.ObjectId): Promise<number> {
    const blocks = await this.evidenceBlockModel
      .find({ caseId })
      .sort({ blockIndex: 1, _id: 1 })
      .limit(this.config.get("INTELLIGENCE_MAX_BLOCKS_PER_EVIDENCE") ?? 100)
      .exec();
    const pending = blocks.filter((block) => {
      const hash = textHash(block.normalizedText);
      return block.embeddingHash !== hash;
    });
    if (pending.length === 0) return 0;
    const embeddings = await this.embeddings.embedDocuments(
      pending.map((block) => block.normalizedText),
    );
    const model = this.config.get("EMBEDDING_MODEL") ?? "voyage-4-lite";
    const provider = this.config.get("EMBEDDING_PROVIDER") ?? "voyage";
    await Promise.all(
      pending.map((block, index) => {
        const embedding = embeddings[index];
        if (!embedding) return Promise.resolve();
        return this.evidenceBlockModel
          .updateOne(
            { _id: block._id, caseId },
            {
              $set: {
                embeddedAt: new Date(),
                embedding,
                embeddingDimensions: embedding.length,
                embeddingHash: textHash(block.normalizedText),
                embeddingModel: model,
                embeddingProvider: provider,
              },
            },
          )
          .exec()
          .then(() => undefined);
      }),
    );
    return pending.length;
  }

  async indexProcedureChunks(procedureId: Types.ObjectId): Promise<number> {
    const chunks = await this.procedureChunkModel
      .find({ procedureId })
      .sort({ ordinal: 1, _id: 1 })
      .exec();
    const pending = chunks.filter(
      (chunk) => chunk.embeddingHash !== textHash(chunk.normalizedText),
    );
    if (pending.length === 0) return 0;
    const embeddings = await this.embeddings.embedDocuments(
      pending.map((chunk) => chunk.normalizedText),
    );
    const model = this.config.get("EMBEDDING_MODEL") ?? "voyage-4-lite";
    const provider = this.config.get("EMBEDDING_PROVIDER") ?? "voyage";
    await Promise.all(
      pending.map((chunk, index) => {
        const embedding = embeddings[index];
        if (!embedding) return Promise.resolve();
        return this.procedureChunkModel
          .updateOne(
            { _id: chunk._id, procedureId },
            {
              $set: {
                embeddedAt: new Date(),
                embedding,
                embeddingDimensions: embedding.length,
                embeddingHash: textHash(chunk.normalizedText),
                embeddingModel: model,
                embeddingProvider: provider,
              },
            },
          )
          .exec()
          .then(() => undefined);
      }),
    );
    return pending.length;
  }
}

function textHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
