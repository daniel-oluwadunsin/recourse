import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  submissionCapabilityValues,
  type SubmissionCapability,
} from "@recourse/contracts";

@Schema({
  collection: "procedure_versions",
  timestamps: { createdAt: true, updatedAt: false },
})
export class ProcedureVersion {
  @Prop({ ref: "Procedure", required: true, type: SchemaTypes.ObjectId })
  procedureId!: Types.ObjectId;

  @Prop({ min: 1, required: true, type: Number })
  version!: number;

  @Prop({ default: null, ref: "ProcedureVersion", type: SchemaTypes.ObjectId })
  previousVersionId!: Types.ObjectId | null;

  @Prop({ required: true, type: String })
  contentSha256!: string;

  @Prop({ default: {}, type: Object })
  scope!: Record<string, unknown>;

  @Prop({ default: {}, type: Object })
  internalReview!: Record<string, unknown>;

  @Prop({ default: [], type: [Object] })
  deadlines!: Record<string, unknown>[];

  @Prop({ default: [], type: [Object] })
  evidenceRequirements!: Record<string, unknown>[];

  @Prop({ default: [], type: [Object] })
  steps!: Record<string, unknown>[];

  @Prop({ default: [], type: [Object] })
  escalationRoutes!: Record<string, unknown>[];

  @Prop({ enum: [...submissionCapabilityValues], required: true, type: String })
  submissionCapability!: SubmissionCapability;

  @Prop({ default: [], ref: "ProceduralClaim", type: [SchemaTypes.ObjectId] })
  proceduralClaimIds!: Types.ObjectId[];

  @Prop({ default: [], ref: "SourceSnapshot", type: [SchemaTypes.ObjectId] })
  sourceSnapshotIds!: Types.ObjectId[];

  @Prop({ min: 0, max: 1, required: true, type: Number })
  confidence!: number;

  @Prop({ default: {}, type: Object })
  confidenceFactors!: Record<string, unknown>;

  @Prop({ default: [], type: [Object] })
  conflicts!: Record<string, unknown>[];

  @Prop({ default: null, maxlength: 2000, type: String })
  semanticChangeSummary!: string | null;

  @Prop({ required: true, type: Date })
  observedAt!: Date;

  createdAt!: Date;
}

export type ProcedureVersionDocument = HydratedDocument<ProcedureVersion>;
export const ProcedureVersionSchema =
  SchemaFactory.createForClass(ProcedureVersion);

ProcedureVersionSchema.index(
  { procedureId: 1, version: 1 },
  { name: "procedure_versions_procedure_version_unique", unique: true },
);
ProcedureVersionSchema.index(
  { procedureId: 1, createdAt: -1 },
  { name: "procedure_versions_procedure_created" },
);
ProcedureVersionSchema.index(
  { contentSha256: 1 },
  { name: "procedure_versions_content_hash" },
);
