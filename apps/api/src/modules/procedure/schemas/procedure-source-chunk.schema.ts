import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import { type SourceAuthorityTier } from "@recourse/contracts";
import { sourceAuthorityTierValues } from "@recourse/contracts";

@Schema({ collection: "procedure_source_chunks", timestamps: true })
export class ProcedureSourceChunk {
  @Prop({ ref: "SourceSnapshot", required: true, type: SchemaTypes.ObjectId })
  sourceSnapshotId!: Types.ObjectId;

  @Prop({ ref: "Procedure", required: true, type: SchemaTypes.ObjectId })
  procedureId!: Types.ObjectId;

  @Prop({ ref: "ProcedureVersion", default: null, type: SchemaTypes.ObjectId })
  procedureVersionId!: Types.ObjectId | null;

  @Prop({ ref: "Institution", default: null, type: SchemaTypes.ObjectId })
  institutionId!: Types.ObjectId | null;

  @Prop({ default: null, type: String })
  jurisdictionKey!: string | null;

  @Prop({ enum: [...sourceAuthorityTierValues], required: true, type: String })
  authorityTier!: SourceAuthorityTier;

  @Prop({ required: true, type: String })
  canonicalUrl!: string;

  @Prop({ required: true, type: String })
  paragraphId!: string;

  @Prop({ min: 0, required: true, type: Number })
  ordinal!: number;

  @Prop({ required: true, type: String })
  text!: string;

  @Prop({ required: true, type: String })
  normalizedText!: string;

  @Prop({ required: true, type: String })
  contentSha256!: string;

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

export type ProcedureSourceChunkDocument =
  HydratedDocument<ProcedureSourceChunk>;
export const ProcedureSourceChunkSchema =
  SchemaFactory.createForClass(ProcedureSourceChunk);

ProcedureSourceChunkSchema.index(
  { sourceSnapshotId: 1, paragraphId: 1 },
  { name: "procedure_source_chunks_snapshot_paragraph_unique", unique: true },
);
ProcedureSourceChunkSchema.index(
  { procedureId: 1, procedureVersionId: 1, ordinal: 1 },
  { name: "procedure_source_chunks_procedure_version_ordinal" },
);
ProcedureSourceChunkSchema.index(
  { institutionId: 1, jurisdictionKey: 1, authorityTier: 1 },
  { name: "procedure_source_chunks_scope_authority" },
);
ProcedureSourceChunkSchema.index(
  { normalizedText: "text", text: "text" },
  { name: "procedure_source_chunks_lexical" },
);
