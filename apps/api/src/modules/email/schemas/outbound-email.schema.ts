import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

@Schema({ collection: "outbound_emails", timestamps: true })
export class OutboundEmail {
  @Prop({ default: null, ref: "Case", type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId | null;

  @Prop({ default: null, ref: "User", type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId | null;

  @Prop({ required: true, type: String })
  idempotencyKey!: string;

  @Prop({ required: true, type: String })
  toAddress!: string;

  @Prop({ required: true, type: String })
  subject!: string;

  @Prop({ required: true, type: String })
  bodyText!: string;

  @Prop({ default: null, type: String })
  replyTo!: string | null;

  @Prop({ default: null, type: String })
  providerMessageId!: string | null;

  @Prop({
    required: true,
    enum: ["QUEUED", "SENDING", "PROVIDER_ACCEPTED", "FAILED", "UNKNOWN"],
    type: String,
  })
  status!: "QUEUED" | "SENDING" | "PROVIDER_ACCEPTED" | "FAILED" | "UNKNOWN";

  @Prop({ default: 0, min: 0, type: Number })
  attempts!: number;

  @Prop({ default: null, type: String })
  failureCode!: string | null;

  @Prop({ default: null, maxlength: 500, type: String })
  failureMessage!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type OutboundEmailDocument = HydratedDocument<OutboundEmail>;
export const OutboundEmailSchema = SchemaFactory.createForClass(OutboundEmail);

OutboundEmailSchema.index(
  { idempotencyKey: 1 },
  { name: "outbound_emails_idempotency_unique", unique: true },
);
OutboundEmailSchema.index(
  { status: 1, updatedAt: 1 },
  { name: "outbound_emails_status_updated" },
);
