import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  actionStatusValues,
  actionVerificationStatusValues,
  controlledActionTypeValues,
  submissionCapabilityValues,
  type ActionStatus,
  type ActionVerificationStatus,
  type ControlledActionType,
  type SubmissionCapability,
} from "@recourse/contracts";

@Schema({ collection: "case_actions", timestamps: true })
export class CaseAction {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ ref: "Appeal", default: null, type: SchemaTypes.ObjectId })
  appealId!: Types.ObjectId | null;

  @Prop({ enum: [...controlledActionTypeValues], required: true, type: String })
  actionType!: ControlledActionType;

  @Prop({ enum: [...submissionCapabilityValues], required: true, type: String })
  capability!: SubmissionCapability;

  @Prop({ enum: [...actionStatusValues], required: true, type: String })
  status!: ActionStatus;

  @Prop({
    enum: [...actionVerificationStatusValues],
    required: true,
    type: String,
  })
  verificationStatus!: ActionVerificationStatus;

  @Prop({ required: true, type: Boolean })
  requiresApproval!: boolean;

  @Prop({ required: true, type: String })
  idempotencyKey!: string;

  @Prop({ required: true, type: String })
  payloadHash!: string;

  @Prop({ required: true, type: Object })
  recommendation!: Record<string, unknown>;

  @Prop({ default: null, type: Object })
  preparedPayload!: Record<string, unknown> | null;

  @Prop({ default: null, type: String })
  adapterName!: string | null;

  @Prop({ default: null, type: String })
  externalReference!: string | null;

  @Prop({ default: null, type: String })
  failureCode!: string | null;

  @Prop({ default: null, maxlength: 500, type: String })
  failureMessage!: string | null;

  @Prop({ default: null, ref: "User", type: SchemaTypes.ObjectId })
  approvedBy!: Types.ObjectId | null;

  @Prop({ default: null, type: Date })
  approvedAt!: Date | null;

  @Prop({ default: 0, min: 0, required: true, type: Number })
  executionAttempts!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CaseActionDocument = HydratedDocument<CaseAction>;
export const CaseActionSchema = SchemaFactory.createForClass(CaseAction);

CaseActionSchema.index(
  { caseId: 1, idempotencyKey: 1 },
  { name: "case_actions_case_idempotency_unique", unique: true },
);
CaseActionSchema.index(
  { caseId: 1, createdAt: -1, _id: -1 },
  { name: "case_actions_case_created" },
);
CaseActionSchema.index(
  { ownerId: 1, status: 1, updatedAt: -1 },
  { name: "case_actions_owner_status_updated" },
);
