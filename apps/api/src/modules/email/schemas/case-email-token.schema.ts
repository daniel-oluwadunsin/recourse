import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

@Schema({ collection: "case_email_tokens", timestamps: true })
export class CaseEmailToken {
  @Prop({ required: true, type: SchemaTypes.ObjectId, ref: "Case" })
  caseId!: Types.ObjectId;

  @Prop({ required: true, type: SchemaTypes.ObjectId, ref: "User" })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  tokenHash!: string;

  @Prop({ required: true, type: String })
  opaqueAddress!: string;

  @Prop({ default: true, required: true, type: Boolean })
  active!: boolean;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CaseEmailTokenDocument = HydratedDocument<CaseEmailToken>;
export const CaseEmailTokenSchema =
  SchemaFactory.createForClass(CaseEmailToken);

CaseEmailTokenSchema.index(
  { tokenHash: 1 },
  { name: "case_email_tokens_hash_unique", unique: true },
);
CaseEmailTokenSchema.index(
  { expiresAt: 1 },
  { name: "case_email_tokens_expiry", expireAfterSeconds: 0 },
);
CaseEmailTokenSchema.index(
  { caseId: 1, active: 1 },
  { name: "case_email_tokens_case_active" },
);
