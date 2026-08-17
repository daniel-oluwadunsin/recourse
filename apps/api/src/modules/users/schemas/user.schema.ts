import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export enum UserStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  DELETION_PENDING = "DELETION_PENDING",
}

@Schema({ collection: "users", timestamps: true })
export class User {
  @Prop({ required: true, trim: true, type: String })
  email!: string;

  @Prop({ required: true, select: false, type: String })
  passwordHash!: string;

  @Prop({ default: null, type: Date })
  emailVerifiedAt!: Date | null;

  @Prop({
    default: UserStatus.ACTIVE,
    enum: Object.values(UserStatus),
    required: true,
    type: String,
  })
  status!: UserStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { name: "users_email_unique", unique: true });
UserSchema.set("toJSON", {
  transform: (_document, returned) => {
    const returnedRecord = returned as unknown as { passwordHash?: string };
    delete returnedRecord.passwordHash;
    return returned;
  },
});
