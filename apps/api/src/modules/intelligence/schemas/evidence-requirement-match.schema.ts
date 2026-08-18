import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  evidenceRequirementMatchStatusValues,
  type EvidenceRequirementMatchStatus,
} from "@recourse/contracts";

@Schema({ collection: "evidence_requirement_matches", timestamps: true })
export class EvidenceRequirementMatch {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ ref: "ProcedureVersion", required: true, type: SchemaTypes.ObjectId })
  procedureVersionId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  requirementKey!: string;

  @Prop({ required: true, type: String })
  requirementText!: string;

  @Prop({ default: false, type: Boolean })
  critical!: boolean;

  @Prop({
    enum: [...evidenceRequirementMatchStatusValues],
    required: true,
    type: String,
  })
  status!: EvidenceRequirementMatchStatus;

  @Prop({ default: [], ref: "Evidence", type: [SchemaTypes.ObjectId] })
  evidenceIds!: Types.ObjectId[];

  @Prop({ default: [], ref: "Claim", type: [SchemaTypes.ObjectId] })
  claimIds!: Types.ObjectId[];

  @Prop({ required: true, type: String })
  reason!: string;

  @Prop({ min: 0, max: 1, required: true, type: Number })
  confidence!: number;

  @Prop({ default: null, ref: "AIRun", type: SchemaTypes.ObjectId })
  modelRunId!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type EvidenceRequirementMatchDocument =
  HydratedDocument<EvidenceRequirementMatch>;
export const EvidenceRequirementMatchSchema = SchemaFactory.createForClass(
  EvidenceRequirementMatch,
);

EvidenceRequirementMatchSchema.index(
  { caseId: 1, procedureVersionId: 1, requirementKey: 1 },
  { name: "requirement_matches_case_version_key_unique", unique: true },
);
EvidenceRequirementMatchSchema.index(
  { caseId: 1, critical: 1, status: 1, updatedAt: -1 },
  { name: "requirement_matches_case_critical_status" },
);
