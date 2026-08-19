import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  businessDayRuleValues,
  deadlineRelativeUnitValues,
  deadlineStatusValues,
  deadlineTriggerTypeValues,
  deadlineTypeValues,
  type BusinessDayRule,
  type DeadlineRelativeUnit,
  type DeadlineStatus,
  type DeadlineTriggerType,
  type DeadlineType,
} from "@recourse/contracts";

@Schema({ collection: "deadlines", timestamps: true })
export class Deadline {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ enum: [...deadlineTypeValues], required: true, type: String })
  type!: DeadlineType;

  @Prop({ default: null, ref: "ProceduralClaim", type: SchemaTypes.ObjectId })
  sourceProceduralClaimId!: Types.ObjectId | null;

  @Prop({ default: null, ref: "ProcedureVersion", type: SchemaTypes.ObjectId })
  sourceProcedureVersionId!: Types.ObjectId | null;

  @Prop({ default: null, ref: "SourceSnapshot", type: SchemaTypes.ObjectId })
  sourceSnapshotId!: Types.ObjectId | null;

  @Prop({ enum: [...deadlineTriggerTypeValues], required: true, type: String })
  triggerType!: DeadlineTriggerType;

  @Prop({ default: null, type: Date })
  triggerDate!: Date | null;

  @Prop({ default: null, min: 0, type: Number })
  relativeAmount!: number | null;

  @Prop({ enum: [...deadlineRelativeUnitValues], default: null, type: String })
  relativeUnit!: DeadlineRelativeUnit | null;

  @Prop({ default: null, type: Date })
  dueAt!: Date | null;

  @Prop({ default: "UTC", required: true, type: String })
  timezone!: string;

  @Prop({ enum: [...businessDayRuleValues], required: true, type: String })
  businessDayRule!: BusinessDayRule;

  @Prop({ max: 1, min: 0, required: true, type: Number })
  confidence!: number;

  @Prop({ enum: [...deadlineStatusValues], required: true, type: String })
  status!: DeadlineStatus;

  @Prop({ default: () => [], type: [Date] })
  reminderSchedule!: Date[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type DeadlineDocument = HydratedDocument<Deadline>;

export const DeadlineSchema = SchemaFactory.createForClass(Deadline);

DeadlineSchema.index({ caseId: 1, dueAt: 1 }, { name: "deadlines_case_due" });
DeadlineSchema.index(
  { caseId: 1, status: 1, dueAt: 1 },
  { name: "deadlines_case_status_due" },
);
DeadlineSchema.index(
  { caseId: 1, sourceProcedureVersionId: 1, type: 1 },
  { name: "deadlines_case_source_version_type" },
);
