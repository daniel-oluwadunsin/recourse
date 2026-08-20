import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  sourceAuthorityTierValues,
  sourceSnapshotStatusValues,
  type SourceAuthorityTier,
  type SourceSnapshotStatus,
} from "@recourse/contracts";

@Schema({ _id: false })
export class SourceParagraph {
  @Prop({ required: true, type: String })
  paragraphId!: string;

  @Prop({ min: 0, required: true, type: Number })
  ordinal!: number;

  @Prop({ required: true, type: String })
  text!: string;
}

export const SourceParagraphSchema =
  SchemaFactory.createForClass(SourceParagraph);

@Schema({
  collection: "source_snapshots",
  timestamps: { createdAt: true, updatedAt: false },
})
export class SourceSnapshot {
  @Prop({ required: true, type: String })
  url!: string;

  @Prop({ required: true, type: String })
  canonicalUrl!: string;

  @Prop({ required: true, type: String })
  domain!: string;

  @Prop({ default: null, type: String })
  title!: string | null;

  @Prop({ enum: [...sourceAuthorityTierValues], required: true, type: String })
  authorityTier!: SourceAuthorityTier;

  @Prop({ default: null, type: String })
  jurisdiction!: string | null;

  @Prop({ required: true, type: Date })
  retrievedAt!: Date;

  @Prop({ required: true, match: /^[a-f0-9]{64}$/, type: String })
  contentSha256!: string;

  @Prop({ default: null, type: String })
  rawStorageKey!: string | null;

  @Prop({ default: null, min: 100, max: 599, type: Number })
  httpStatus!: number | null;

  @Prop({ required: true, type: String })
  retrievalProvider!: string;

  @Prop({ required: true, ref: "RetrievalRun", type: SchemaTypes.ObjectId })
  retrievalRunId!: Types.ObjectId;

  @Prop({ required: true, type: [SourceParagraphSchema] })
  paragraphs!: SourceParagraph[];

  @Prop({ enum: [...sourceSnapshotStatusValues], required: true, type: String })
  status!: SourceSnapshotStatus;

  @Prop({ default: {}, type: Object })
  metadata!: Record<string, unknown>;

  createdAt!: Date;
}

export type SourceSnapshotDocument = HydratedDocument<SourceSnapshot>;
export const SourceSnapshotSchema =
  SchemaFactory.createForClass(SourceSnapshot);

SourceSnapshotSchema.index(
  { canonicalUrl: 1, contentSha256: 1 },
  { name: "source_snapshots_url_content_unique", unique: true },
);
SourceSnapshotSchema.index(
  { canonicalUrl: 1, retrievedAt: -1 },
  { name: "source_snapshots_url_retrieved" },
);
SourceSnapshotSchema.index(
  { contentSha256: 1 },
  { name: "source_snapshots_content_hash" },
);
SourceSnapshotSchema.index(
  { domain: 1, authorityTier: 1, retrievedAt: -1 },
  { name: "source_snapshots_domain_authority" },
);
