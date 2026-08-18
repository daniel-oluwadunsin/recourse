import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import { queueNameValues, type QueueName } from "@recourse/contracts";

export enum WorkflowDispatchStatus {
  PENDING = "PENDING",
  ENQUEUED = "ENQUEUED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

@Schema({ collection: "workflow_dispatches", timestamps: true })
export class WorkflowDispatch {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "CaseEvent", required: true, type: SchemaTypes.ObjectId })
  eventId!: Types.ObjectId;

  @Prop({ required: true, type: Number })
  eventSequence!: number;

  @Prop({ required: true, type: String })
  eventType!: string;

  @Prop({ enum: [...queueNameValues], required: true, type: String })
  queueName!: QueueName;

  @Prop({ required: true, type: String })
  jobName!: string;

  @Prop({ required: true, type: String })
  jobId!: string;

  @Prop({ required: true, type: String })
  idempotencyKey!: string;

  @Prop({
    enum: Object.values(WorkflowDispatchStatus),
    required: true,
    type: String,
  })
  status!: WorkflowDispatchStatus;

  @Prop({ default: 0, min: 0, type: Number })
  attempts!: number;

  @Prop({ default: null, type: Date })
  leaseUntil!: Date | null;

  @Prop({ default: null, maxlength: 500, type: String })
  lastError!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type WorkflowDispatchDocument = HydratedDocument<WorkflowDispatch>;

export const WorkflowDispatchSchema =
  SchemaFactory.createForClass(WorkflowDispatch);

WorkflowDispatchSchema.index(
  { eventId: 1 },
  { name: "workflow_dispatches_event_unique", unique: true },
);
WorkflowDispatchSchema.index(
  { status: 1, leaseUntil: 1, createdAt: 1 },
  { name: "workflow_dispatches_pending_reconcile" },
);
WorkflowDispatchSchema.index(
  { caseId: 1, eventSequence: 1 },
  { name: "workflow_dispatches_case_sequence" },
);
