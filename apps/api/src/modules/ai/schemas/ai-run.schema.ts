import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import { aiRunStatusValues, type AIRunStatus } from "@recourse/contracts";

@Schema({ collection: "ai_runs", timestamps: true })
export class AIRun {
  @Prop({ default: null, ref: "Case", type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId | null;

  @Prop({ default: null, ref: "Evidence", type: SchemaTypes.ObjectId })
  evidenceId!: Types.ObjectId | null;

  @Prop({ required: true, type: String })
  operation!: string;

  @Prop({ required: true, type: String })
  model!: string;

  @Prop({ required: true, type: String })
  provider!: string;

  @Prop({ required: true, type: String })
  promptVersion!: string;

  @Prop({ required: true, type: String })
  schemaVersion!: string;

  @Prop({ required: true, type: [String] })
  inputRefs!: string[];

  @Prop({ required: true, type: [String] })
  inputHashes!: string[];

  // Only validated final structured output is persisted. Private reasoning is not.
  @Prop({ default: null, type: Object })
  output!: Record<string, unknown> | null;

  @Prop({ default: null, type: String })
  reasoningEffort!: string | null;

  @Prop({ default: null, min: 0, type: Number })
  latencyMs!: number | null;

  @Prop({ default: null, type: Object })
  usage!: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;

  @Prop({ default: null, min: 0, type: Number })
  costEstimate!: number | null;

  @Prop({ enum: [...aiRunStatusValues], required: true, type: String })
  status!: AIRunStatus;

  @Prop({ default: null, maxlength: 100, type: String })
  errorCode!: string | null;

  @Prop({ default: null, maxlength: 500, type: String })
  errorMessage!: string | null;

  @Prop({ default: null, type: String })
  providerRequestId!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AIRunDocument = HydratedDocument<AIRun>;

export const AIRunSchema = SchemaFactory.createForClass(AIRun);

AIRunSchema.index(
  { caseId: 1, createdAt: -1 },
  { name: "ai_runs_case_created" },
);
AIRunSchema.index(
  { evidenceId: 1, createdAt: -1 },
  { name: "ai_runs_evidence_created" },
);
AIRunSchema.index(
  { operation: 1, status: 1, createdAt: -1 },
  { name: "ai_runs_operation_status_created" },
);
