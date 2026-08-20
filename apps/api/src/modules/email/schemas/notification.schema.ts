import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  notificationChannelValues,
  type NotificationChannel,
} from "@recourse/contracts";

@Schema({ collection: "notifications", timestamps: true })
export class Notification {
  @Prop({ required: true, ref: "User", type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ default: null, ref: "Case", type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId | null;

  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ required: true, maxlength: 200, type: String })
  title!: string;

  @Prop({ required: true, maxlength: 2000, type: String })
  body!: string;

  @Prop({ required: true, type: String })
  deduplicationKey!: string;

  @Prop({ default: [], enum: [...notificationChannelValues], type: [String] })
  channels!: NotificationChannel[];

  @Prop({ default: null, type: Date })
  readAt!: Date | null;

  @Prop({ default: null, ref: "OutboundEmail", type: SchemaTypes.ObjectId })
  outboundEmailId!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index(
  { deduplicationKey: 1 },
  { name: "notifications_dedup_unique", unique: true },
);
NotificationSchema.index(
  { ownerId: 1, readAt: 1, createdAt: -1 },
  { name: "notifications_owner_read_created" },
);
