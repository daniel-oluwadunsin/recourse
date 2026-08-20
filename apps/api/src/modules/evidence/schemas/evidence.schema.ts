import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  evidenceErrorCodeValues,
  evidenceExtractionMethodValues,
  evidenceKindValues,
  evidenceMalwareScanStatusValues,
  evidenceProcessingStatusValues,
  type EvidenceErrorCode,
  type EvidenceExtractionMethod,
  type EvidenceKind,
  type EvidenceMalwareScanStatus,
  type EvidenceProcessingStatus,
} from "@recourse/contracts";

@Schema({ collection: "evidence", timestamps: true })
export class Evidence {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ enum: [...evidenceKindValues], required: true, type: String })
  kind!: EvidenceKind;

  @Prop({ default: null, maxlength: 200, trim: true, type: String })
  label!: string | null;

  // Display metadata only. It is never included in a storage key.
  @Prop({ default: null, maxlength: 255, type: String })
  originalFilename!: string | null;

  @Prop({ required: true, type: String })
  mimeType!: string;

  @Prop({ required: true, type: String })
  extension!: string;

  @Prop({ min: 1, required: true, type: Number })
  byteSize!: number;

  @Prop({ default: null, match: /^[a-f0-9]{64}$/, type: String })
  sha256!: string | null;

  @Prop({ required: true, type: String })
  storageKey!: string;

  @Prop({ required: true, type: Date })
  uploadExpiresAt!: Date;

  @Prop({ default: null, type: String })
  storageAssetId!: string | null;

  @Prop({ default: null, type: String })
  storageVersion!: string | null;

  @Prop({
    enum: [...evidenceProcessingStatusValues],
    required: true,
    type: String,
  })
  processingStatus!: EvidenceProcessingStatus;

  @Prop({
    default: null,
    enum: [...evidenceExtractionMethodValues],
    type: String,
  })
  extractionMethod!: EvidenceExtractionMethod | null;

  @Prop({ default: null, min: 0, type: Number })
  pageCount!: number | null;

  @Prop({ default: null, enum: [...evidenceErrorCodeValues], type: String })
  processingErrorCode!: EvidenceErrorCode | null;

  @Prop({ default: null, maxlength: 500, type: String })
  processingErrorMessage!: string | null;

  @Prop({
    default: "PENDING",
    enum: [...evidenceMalwareScanStatusValues],
    required: true,
    type: String,
  })
  malwareScanStatus!: EvidenceMalwareScanStatus;

  @Prop({ default: null, type: Object })
  extractionMetadata!: Record<string, unknown> | null;

  @Prop({ default: null, type: Date })
  extractionCompletedAt!: Date | null;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  revision!: number;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  deletionVersion!: number;

  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type EvidenceDocument = HydratedDocument<Evidence>;

export const EvidenceSchema = SchemaFactory.createForClass(Evidence);

EvidenceSchema.index(
  { caseId: 1, createdAt: -1, _id: -1 },
  { name: "evidence_case_created" },
);
EvidenceSchema.index(
  { ownerId: 1, processingStatus: 1, updatedAt: -1 },
  { name: "evidence_owner_status_updated" },
);
EvidenceSchema.index(
  { storageKey: 1 },
  { name: "evidence_storage_key_unique", unique: true },
);
EvidenceSchema.index(
  { caseId: 1, sha256: 1 },
  {
    name: "evidence_case_sha256_unique",
    partialFilterExpression: {
      deletedAt: null,
      sha256: { $type: "string" },
    },
    unique: true,
  },
);
EvidenceSchema.index(
  { caseId: 1, deletedAt: 1, createdAt: -1 },
  { name: "evidence_case_deleted_created" },
);
