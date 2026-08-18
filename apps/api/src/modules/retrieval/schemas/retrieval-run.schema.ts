import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  retrievalOperationValues,
  retrievalRunStatusValues,
  type RetrievalOperation,
  type RetrievalRunStatus,
} from "@recourse/contracts";

@Schema({ collection: "retrieval_runs", timestamps: true })
export class RetrievalRun {
  @Prop({ default: null, ref: "Case", type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId | null;

  @Prop({ enum: [...retrievalOperationValues], required: true, type: String })
  operation!: RetrievalOperation;

  @Prop({ required: true, type: String })
  provider!: string;

  @Prop({ default: [], type: [String] })
  queries!: string[];

  @Prop({ default: {}, type: Object })
  filters!: Record<string, unknown>;

  @Prop({ default: [], type: [String] })
  resultUrls!: string[];

  @Prop({ default: [], ref: "SourceSnapshot", type: [SchemaTypes.ObjectId] })
  sourceSnapshotIds!: Types.ObjectId[];

  @Prop({ default: null, min: 0, type: Number })
  creditsOrCost!: number | null;

  @Prop({ default: null, min: 0, type: Number })
  latencyMs!: number | null;

  @Prop({ default: null, type: String })
  providerRequestId!: string | null;

  @Prop({ enum: [...retrievalRunStatusValues], required: true, type: String })
  status!: RetrievalRunStatus;

  @Prop({ default: null, maxlength: 100, type: String })
  errorCode!: string | null;

  @Prop({ default: null, maxlength: 500, type: String })
  errorMessage!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type RetrievalRunDocument = HydratedDocument<RetrievalRun>;
export const RetrievalRunSchema = SchemaFactory.createForClass(RetrievalRun);

RetrievalRunSchema.index(
  { caseId: 1, createdAt: -1 },
  { name: "retrieval_runs_case_created" },
);
RetrievalRunSchema.index(
  { provider: 1, operation: 1, status: 1, createdAt: -1 },
  { name: "retrieval_runs_provider_operation_status" },
);
