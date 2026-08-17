import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  caseEventActorTypeValues,
  caseEventTypeValues,
  type CaseEventActorType,
  type CaseEventType,
} from "@recourse/contracts";

@Schema({
  collection: "case_events",
  timestamps: { createdAt: true, updatedAt: false },
})
export class CaseEvent {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ min: 1, required: true, type: Number })
  sequence!: number;

  @Prop({ enum: [...caseEventTypeValues], required: true, type: String })
  type!: CaseEventType;

  @Prop({ enum: [...caseEventActorTypeValues], required: true, type: String })
  actorType!: CaseEventActorType;

  @Prop({ default: null, type: String })
  actorId!: string | null;

  @Prop({ default: null, type: String })
  correlationId!: string | null;

  @Prop({ type: String })
  idempotencyKey?: string;

  @Prop({ required: true, type: SchemaTypes.Mixed })
  payload!: Record<string, unknown>;

  createdAt!: Date;
}

export type CaseEventDocument = HydratedDocument<CaseEvent>;

export const CaseEventSchema = SchemaFactory.createForClass(CaseEvent);

CaseEventSchema.index(
  { caseId: 1, sequence: 1 },
  { name: "case_events_case_sequence_unique", unique: true },
);
CaseEventSchema.index(
  { caseId: 1, createdAt: 1 },
  { name: "case_events_case_created" },
);
CaseEventSchema.index(
  { caseId: 1, idempotencyKey: 1 },
  {
    name: "case_events_case_idempotency_unique",
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);
