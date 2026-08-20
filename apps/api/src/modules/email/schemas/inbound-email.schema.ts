import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

@Schema({ collection: "inbound_emails", timestamps: true })
export class InboundEmail {
  @Prop({ required: true, type: String })
  providerMessageId!: string;

  @Prop({ default: null, type: String })
  internetMessageId!: string | null;

  @Prop({ default: null, ref: "CaseResponse", type: SchemaTypes.ObjectId })
  responseId!: Types.ObjectId | null;

  @Prop({ default: null, ref: "Case", type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId | null;

  @Prop({
    required: true,
    enum: ["ASSOCIATED", "UNRELATED", "AMBIGUOUS"],
    type: String,
  })
  associationStatus!: "ASSOCIATED" | "UNRELATED" | "AMBIGUOUS";

  @Prop({ required: true, type: Date })
  receivedAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type InboundEmailDocument = HydratedDocument<InboundEmail>;
export const InboundEmailSchema = SchemaFactory.createForClass(InboundEmail);

InboundEmailSchema.index(
  { providerMessageId: 1 },
  { name: "inbound_emails_provider_id_unique", unique: true },
);
InboundEmailSchema.index(
  { internetMessageId: 1 },
  { name: "inbound_emails_internet_id" },
);
