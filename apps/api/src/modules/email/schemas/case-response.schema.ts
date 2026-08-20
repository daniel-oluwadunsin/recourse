import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  responseAssociationStatusValues,
  responseOutcomeValues,
  responseProcessingStatusValues,
  type ResponseAssociationStatus,
  type ResponseOutcome,
  type ResponseProcessingStatus,
} from "@recourse/contracts";

@Schema({ collection: "case_responses", timestamps: true })
export class CaseResponse {
  @Prop({ default: null, ref: "Case", type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId | null;

  @Prop({ default: null, ref: "User", type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId | null;

  @Prop({ default: null, ref: "Evidence", type: SchemaTypes.ObjectId })
  evidenceId!: Types.ObjectId | null;

  @Prop({ required: true, type: String })
  providerMessageId!: string;

  @Prop({ default: null, type: String })
  internetMessageId!: string | null;

  @Prop({ required: true, type: String })
  fromAddress!: string;

  @Prop({ default: [], type: [String] })
  toAddresses!: string[];

  @Prop({ default: null, type: String })
  subject!: string | null;

  @Prop({ required: true, maxlength: 500000, type: String })
  bodyText!: string;

  @Prop({ default: 0, min: 0, type: Number })
  attachmentCount!: number;

  @Prop({
    enum: [...responseAssociationStatusValues],
    required: true,
    type: String,
  })
  associationStatus!: ResponseAssociationStatus;

  @Prop({
    enum: [...responseProcessingStatusValues],
    required: true,
    type: String,
  })
  processingStatus!: ResponseProcessingStatus;

  @Prop({ default: null, enum: [...responseOutcomeValues], type: String })
  outcome!: ResponseOutcome | null;

  @Prop({ default: null, min: 0, max: 1, type: Number })
  outcomeConfidence!: number | null;

  @Prop({ default: null, maxlength: 5000, type: String })
  statedReason!: string | null;

  @Prop({ default: [], type: [String] })
  addressedClaimIds!: string[];

  @Prop({ default: [], type: [String] })
  unaddressedClaimIds!: string[];

  @Prop({ default: [], type: [Object] })
  newIssues!: Array<Record<string, unknown>>;

  @Prop({ default: [], type: [String] })
  requestedEvidence!: string[];

  @Prop({ default: [], type: [String] })
  mentionedDeadlines!: string[];

  @Prop({ default: null, ref: "AIRun", type: SchemaTypes.ObjectId })
  analysisRunId!: Types.ObjectId | null;

  @Prop({ default: null, enum: [...responseOutcomeValues], type: String })
  recommendedOutcome!: ResponseOutcome | null;

  @Prop({ default: null, type: String })
  replanNextAction!: string | null;

  @Prop({ default: null, maxlength: 3000, type: String })
  replanRationale!: string | null;

  @Prop({ default: null, ref: "AIRun", type: SchemaTypes.ObjectId })
  replanRunId!: Types.ObjectId | null;

  @Prop({ default: 0, min: 0, type: Number })
  revision!: number;

  @Prop({ required: true, type: Date })
  receivedAt!: Date;

  @Prop({ default: null, type: Date })
  analyzedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CaseResponseDocument = HydratedDocument<CaseResponse>;
export const CaseResponseSchema = SchemaFactory.createForClass(CaseResponse);

CaseResponseSchema.index(
  { providerMessageId: 1 },
  { name: "case_responses_provider_id_unique", unique: true },
);
CaseResponseSchema.index(
  { caseId: 1, receivedAt: -1, _id: -1 },
  { name: "case_responses_case_received" },
);
CaseResponseSchema.index(
  { ownerId: 1, processingStatus: 1, updatedAt: -1 },
  { name: "case_responses_owner_status" },
);
