import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  claimEvidenceStatusValues,
  claimResolutionStatusValues,
  claimSourceTypeValues,
  type ClaimEvidenceStatus,
  type ClaimResolutionStatus,
  type ClaimSourceType,
} from "@recourse/contracts";

@Schema({ _id: false })
export class ClaimSourceRef {
  @Prop({ enum: [...claimSourceTypeValues], required: true, type: String })
  sourceType!: ClaimSourceType;

  @Prop({ required: true, type: String })
  sourceId!: string;

  @Prop({ default: null, type: Object })
  location!: Record<string, unknown> | null;
}

@Schema({ collection: "claims", timestamps: true })
export class Claim {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  text!: string;

  @Prop({ required: true, type: String })
  normalizedText!: string;

  @Prop({ default: null, type: String })
  normalizedType!: string | null;

  @Prop({ default: null, type: String })
  normalizedValue!: string | null;

  @Prop({ required: true, type: String })
  dedupKey!: string;

  @Prop({ enum: [...claimEvidenceStatusValues], required: true, type: String })
  status!: ClaimEvidenceStatus;

  @Prop({
    enum: [...claimResolutionStatusValues],
    required: true,
    type: String,
  })
  resolutionStatus!: ClaimResolutionStatus;

  @Prop({ min: 0, max: 1, required: true, type: Number })
  confidence!: number;

  @Prop({ default: [], type: [ClaimSourceRef] })
  sourceRefs!: ClaimSourceRef[];

  @Prop({ default: [], type: [String] })
  entityRefs!: string[];

  @Prop({ default: null, ref: "AIRun", type: SchemaTypes.ObjectId })
  modelRunId!: Types.ObjectId | null;

  @Prop({ default: null, type: Date })
  userConfirmedAt!: Date | null;

  @Prop({ default: null, ref: "Claim", type: SchemaTypes.ObjectId })
  mergedIntoClaimId!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ClaimDocument = HydratedDocument<Claim>;
export const ClaimSchema = SchemaFactory.createForClass(Claim);

ClaimSchema.index(
  { caseId: 1, dedupKey: 1 },
  { name: "claims_case_dedup_unique", unique: true },
);
ClaimSchema.index(
  { caseId: 1, status: 1, resolutionStatus: 1, updatedAt: -1 },
  { name: "claims_case_status_updated" },
);
ClaimSchema.index(
  { caseId: 1, normalizedType: 1, normalizedValue: 1 },
  { name: "claims_case_normalized_value" },
);
ClaimSchema.index(
  { caseId: 1, normalizedText: "text", text: "text" },
  { name: "claims_case_lexical" },
);
