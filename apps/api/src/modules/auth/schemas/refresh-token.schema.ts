import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

@Schema({ collection: "refresh_tokens", timestamps: true })
export class RefreshToken {
  @Prop({ required: true, type: String })
  jti!: string;

  @Prop({ required: true, type: String })
  familyId!: string;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true, select: false, type: String })
  tokenHash!: string;

  @Prop({ default: null, type: Date })
  usedAt!: Date | null;

  @Prop({ default: null, type: String })
  replacedByJti!: string | null;

  @Prop({ default: null, type: Date })
  revokedAt!: Date | null;

  @Prop({ default: null, type: String })
  revokeReason!: string | null;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

RefreshTokenSchema.index(
  { jti: 1 },
  { name: "refresh_tokens_jti_unique", unique: true },
);
RefreshTokenSchema.index(
  { familyId: 1, revokedAt: 1, usedAt: 1 },
  { name: "refresh_tokens_family_state" },
);
RefreshTokenSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "refresh_tokens_user_created" },
);
RefreshTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "refresh_tokens_expires_at_ttl" },
);
