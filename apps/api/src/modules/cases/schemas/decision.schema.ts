import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  decisionTypeValues,
  type JurisdictionRef,
  relationshipTypeValues,
  type DecisionType,
  type RelationshipType,
} from "@recourse/contracts";

import {
  FinancialImpactSchema,
  type FinancialImpactPersistence,
} from "./financial-impact.schema";

@Schema({ collection: "decisions", timestamps: true })
export class Decision {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ default: null, ref: "Evidence", type: SchemaTypes.ObjectId })
  sourceEvidenceId!: Types.ObjectId | null;

  @Prop({ default: null, trim: true, type: String })
  institutionName!: string | null;

  @Prop({ default: null, enum: [...relationshipTypeValues], type: String })
  relationship!: RelationshipType | null;

  @Prop({ default: null, enum: [...decisionTypeValues], type: String })
  decisionType!: DecisionType | null;

  @Prop({ default: null, type: String })
  statedReason!: string | null;

  @Prop({ default: null, type: Object })
  jurisdiction!: JurisdictionRef | null;

  @Prop({ default: null, type: Date })
  decisionDate!: Date | null;

  @Prop({ default: null, type: Date })
  notificationDate!: Date | null;

  @Prop({ default: null, type: FinancialImpactSchema })
  financialImpact!: FinancialImpactPersistence | null;

  @Prop({ immutable: true, required: true, type: Object })
  rawExtractedFields!: Record<string, unknown>;

  @Prop({ default: () => ({}), required: true, type: Object })
  userCorrectedFields!: Record<string, unknown>;

  @Prop({ default: null, ref: "AIRun", type: SchemaTypes.ObjectId })
  modelRunId!: Types.ObjectId | null;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type DecisionDocument = HydratedDocument<Decision>;

export const DecisionSchema = SchemaFactory.createForClass(Decision);

DecisionSchema.index(
  { caseId: 1 },
  { name: "decisions_case_unique", unique: true },
);
