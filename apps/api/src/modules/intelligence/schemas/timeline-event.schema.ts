import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  timelineDatePrecisionValues,
  type TimelineDatePrecision,
} from "@recourse/contracts";
import { ClaimSourceRef, ClaimSourceRefSchema } from "./claim.schema";

@Schema({ collection: "timeline_events", timestamps: true })
export class TimelineEvent {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  eventKey!: string;

  @Prop({ required: true, type: String })
  eventText!: string;

  @Prop({ default: null, type: String })
  rawDateText!: string | null;

  @Prop({ default: null, type: Date })
  normalizedDate!: Date | null;

  @Prop({
    enum: [...timelineDatePrecisionValues],
    required: true,
    type: String,
  })
  datePrecision!: TimelineDatePrecision;

  @Prop({ default: [], type: [ClaimSourceRefSchema] })
  sourceRefs!: ClaimSourceRef[];

  @Prop({ min: 0, max: 1, required: true, type: Number })
  confidence!: number;

  @Prop({ default: null, type: Object })
  metadata!: Record<string, unknown> | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type TimelineEventDocument = HydratedDocument<TimelineEvent>;
export const TimelineEventSchema = SchemaFactory.createForClass(TimelineEvent);

TimelineEventSchema.index(
  { caseId: 1, eventKey: 1 },
  { name: "timeline_events_case_key_unique", unique: true },
);
TimelineEventSchema.index(
  { caseId: 1, normalizedDate: 1, _id: 1 },
  { name: "timeline_events_case_date" },
);
