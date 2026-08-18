import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  evidenceBlockTypeValues,
  evidenceExtractionMethodValues,
  type EvidenceBlockType,
  type EvidenceExtractionMethod,
} from "@recourse/contracts";

@Schema({ collection: "evidence_blocks", timestamps: true })
export class EvidenceBlock {
  @Prop({ ref: "Evidence", required: true, type: SchemaTypes.ObjectId })
  evidenceId!: Types.ObjectId;

  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ enum: [...evidenceBlockTypeValues], required: true, type: String })
  blockType!: EvidenceBlockType;

  @Prop({ default: null, min: 1, type: Number })
  pageNumber!: number | null;

  @Prop({ min: 0, required: true, type: Number })
  blockIndex!: number;

  @Prop({ required: true, type: String })
  text!: string;

  @Prop({ required: true, type: String })
  normalizedText!: string;

  @Prop({ default: null, min: 0, type: Number })
  characterStart!: number | null;

  @Prop({ default: null, min: 0, type: Number })
  characterEnd!: number | null;

  @Prop({
    enum: [...evidenceExtractionMethodValues],
    required: true,
    type: String,
  })
  extractionMethod!: EvidenceExtractionMethod;

  @Prop({ default: null, type: Object })
  provenance!: Record<string, unknown> | null;

  @Prop({ default: null, type: Object })
  metadata!: Record<string, unknown> | null;

  @Prop({ default: null, type: [Number] })
  embedding!: number[] | null;

  @Prop({ default: null, type: String })
  embeddingProvider!: string | null;

  @Prop({ default: null, type: String })
  embeddingModel!: string | null;

  @Prop({ default: null, min: 1, type: Number })
  embeddingDimensions!: number | null;

  @Prop({ default: null, type: String })
  embeddingHash!: string | null;

  @Prop({ default: null, type: Date })
  embeddedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type EvidenceBlockDocument = HydratedDocument<EvidenceBlock>;

export const EvidenceBlockSchema = SchemaFactory.createForClass(EvidenceBlock);

EvidenceBlockSchema.index(
  { evidenceId: 1, blockIndex: 1 },
  { name: "evidence_blocks_evidence_index_unique", unique: true },
);
EvidenceBlockSchema.index(
  { caseId: 1, createdAt: 1 },
  { name: "evidence_blocks_case_created" },
);
EvidenceBlockSchema.index(
  { ownerId: 1, evidenceId: 1 },
  { name: "evidence_blocks_owner_evidence" },
);
EvidenceBlockSchema.index(
  { caseId: 1, normalizedText: "text", text: "text" },
  { name: "evidence_blocks_case_lexical" },
);
