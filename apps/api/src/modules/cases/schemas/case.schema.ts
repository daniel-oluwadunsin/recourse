import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  caseStatusValues,
  decisionTypeValues,
  type CaseStatus,
  type DecisionType,
  type JurisdictionRef,
  type ReadinessFactor,
  type RelationshipType,
  relationshipTypeValues,
} from "@recourse/contracts";

import {
  FinancialImpactSchema,
  type FinancialImpactPersistence,
} from "./financial-impact.schema";

export interface ReadinessSnapshot {
  score: number;
  version: string;
  factors: ReadinessFactor[];
  caps: string[];
  computedAt: Date | null;
}

export interface CaseAnalysisSnapshot {
  centralIssues: string[];
  unresolvedFacts: Array<{
    fact: string;
    resolutionOwner: "USER" | "RECOURSE" | "INSTITUTION";
    resolutionAction: string;
    userQuestion: string | null;
    blocking: boolean;
    inputRefs: string[];
  }>;
  recommendedNextSteps: string[];
  supportedClaimIds: string[];
  needsHumanReview: boolean;
  modelRunId: string | null;
  computedAt: Date;
  factAnswers: Array<{
    question: string;
    answer: string;
    answeredAt: Date;
    evidenceId: string;
  }>;
}

@Schema({ collection: "cases", timestamps: true })
export class Case {
  @Prop({ required: true, type: String })
  caseKey!: string;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, trim: true, type: String })
  title!: string;

  @Prop({ default: null, ref: "Institution", type: SchemaTypes.ObjectId })
  institutionId!: Types.ObjectId | null;

  @Prop({ default: null, trim: true, type: String })
  institutionNameRaw!: string | null;

  @Prop({ default: null, enum: [...relationshipTypeValues], type: String })
  relationship!: RelationshipType | null;

  @Prop({ default: null, enum: [...decisionTypeValues], type: String })
  decisionType!: DecisionType | null;

  @Prop({ default: null, type: Object })
  jurisdiction!: JurisdictionRef | null;

  @Prop({ default: null, type: String })
  statedReason!: string | null;

  @Prop({ default: null, type: Date })
  decisionDate!: Date | null;

  @Prop({ default: null, type: Date })
  notificationDate!: Date | null;

  @Prop({ default: null, type: FinancialImpactSchema })
  financialImpact!: FinancialImpactPersistence | null;

  @Prop({ enum: [...caseStatusValues], required: true, type: String })
  status!: CaseStatus;

  @Prop({ enum: [...caseStatusValues], required: true, type: String })
  currentStage!: CaseStatus;

  @Prop({
    default: () => ({
      computedAt: null,
      caps: [],
      factors: [],
      score: 0,
      version: "v1",
    }),
    required: true,
    type: Object,
  })
  readiness!: ReadinessSnapshot;

  @Prop({ default: null, type: Object })
  analysis!: CaseAnalysisSnapshot | null;

  @Prop({ default: null, ref: "Procedure", type: SchemaTypes.ObjectId })
  activeProcedureId!: Types.ObjectId | null;

  @Prop({ default: null, ref: "ProcedureVersion", type: SchemaTypes.ObjectId })
  activeProcedureVersionId!: Types.ObjectId | null;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  graphVersion!: number;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  openCriticalGapCount!: number;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  contradictionCount!: number;

  @Prop({ default: null, ref: "CaseAction", type: SchemaTypes.ObjectId })
  nextRecommendedActionId!: Types.ObjectId | null;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  revision!: number;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  eventSequence!: number;

  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  tombstoneVersion!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CaseDocument = HydratedDocument<Case>;

export const CaseSchema = SchemaFactory.createForClass(Case);

CaseSchema.index(
  { ownerId: 1, updatedAt: -1 },
  { name: "cases_owner_updated" },
);
CaseSchema.index(
  { ownerId: 1, status: 1, updatedAt: -1 },
  { name: "cases_owner_status_updated" },
);
CaseSchema.index(
  { caseKey: 1 },
  { name: "cases_case_key_unique", unique: true },
);
CaseSchema.index(
  { activeProcedureId: 1, status: 1 },
  { name: "cases_active_procedure_status" },
);
CaseSchema.index(
  { ownerId: 1, deletedAt: 1, updatedAt: -1 },
  { name: "cases_owner_deleted_updated" },
);
