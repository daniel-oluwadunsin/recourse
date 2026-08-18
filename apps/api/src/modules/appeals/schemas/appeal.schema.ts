import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  appealStatusValues,
  type AppealStatus,
  type AppealStructuredArguments,
} from "@recourse/contracts";

@Schema({ collection: "appeals", timestamps: true })
export class Appeal {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ min: 1, required: true, type: Number })
  sequence!: number;

  @Prop({ min: 1, required: true, type: Number })
  version!: number;

  @Prop({ enum: [...appealStatusValues], required: true, type: String })
  status!: AppealStatus;

  @Prop({ ref: "ProcedureVersion", required: true, type: SchemaTypes.ObjectId })
  procedureVersionId!: Types.ObjectId;

  @Prop({ required: true, type: Object })
  structuredArguments!: AppealStructuredArguments;

  @Prop({ required: true, type: String })
  renderedBody!: string;

  @Prop({ required: true, type: String })
  title!: string;

  @Prop({ min: 0, max: 1, required: true, type: Number })
  factualGroundingCoverage!: number;

  @Prop({ min: 0, max: 1, required: true, type: Number })
  proceduralGroundingCoverage!: number;

  @Prop({ min: 0, required: true, type: Number })
  unsupportedAssertionCount!: number;

  @Prop({ default: [], ref: "Evidence", type: [SchemaTypes.ObjectId] })
  attachmentEvidenceIds!: Types.ObjectId[];

  @Prop({
    default: [],
    ref: "EvidenceRequirementMatch",
    type: [SchemaTypes.ObjectId],
  })
  attachmentRequirementIds!: Types.ObjectId[];

  @Prop({ default: [], type: [Object] })
  attachmentChecklist!: Record<string, unknown>[];

  @Prop({ required: true, type: String })
  contentHash!: string;

  @Prop({ default: null, ref: "AIRun", type: SchemaTypes.ObjectId })
  modelRunId!: Types.ObjectId | null;

  @Prop({ default: null, type: Date })
  approvedAt!: Date | null;

  @Prop({ default: null, ref: "User", type: SchemaTypes.ObjectId })
  approvedBy!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AppealDocument = HydratedDocument<Appeal>;
export const AppealSchema = SchemaFactory.createForClass(Appeal);

AppealSchema.index(
  { caseId: 1, sequence: 1, version: 1 },
  { name: "appeals_case_sequence_version_unique", unique: true },
);
AppealSchema.index(
  { caseId: 1, sequence: -1, version: -1 },
  { name: "appeals_case_sequence_version" },
);
AppealSchema.index(
  { ownerId: 1, status: 1, updatedAt: -1 },
  { name: "appeals_owner_status_updated" },
);
