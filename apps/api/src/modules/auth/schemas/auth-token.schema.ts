import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

export enum AuthTokenType {
  EMAIL_VERIFICATION = "EMAIL_VERIFICATION",
  PASSWORD_RESET = "PASSWORD_RESET",
}

@Schema({ collection: "auth_tokens", timestamps: true })
export class AuthToken {
  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ enum: Object.values(AuthTokenType), required: true, type: String })
  type!: AuthTokenType;

  @Prop({ required: true, select: false, type: String })
  tokenHash!: string;

  @Prop({ default: null, type: Date })
  consumedAt!: Date | null;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;
}

export type AuthTokenDocument = HydratedDocument<AuthToken>;

export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);

AuthTokenSchema.index(
  { tokenHash: 1 },
  { name: "auth_tokens_token_hash_unique", unique: true },
);
AuthTokenSchema.index(
  { userId: 1, type: 1, consumedAt: 1 },
  { name: "auth_tokens_user_type_state" },
);
AuthTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "auth_tokens_expires_at_ttl" },
);
