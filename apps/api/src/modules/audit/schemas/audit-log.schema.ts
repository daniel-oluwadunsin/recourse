import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

export enum AuditEventType {
  AUTH_SIGN_UP = "AUTH_SIGN_UP",
  AUTH_SIGN_UP_FAILURE = "AUTH_SIGN_UP_FAILURE",
  AUTH_SIGN_IN_FAILURE = "AUTH_SIGN_IN_FAILURE",
  AUTH_SIGN_IN_SUCCESS = "AUTH_SIGN_IN_SUCCESS",
  AUTH_REFRESH = "AUTH_REFRESH",
  AUTH_REFRESH_REUSE_DETECTED = "AUTH_REFRESH_REUSE_DETECTED",
  AUTH_LOGOUT = "AUTH_LOGOUT",
  ACCOUNT_DELETION_FAILED = "ACCOUNT_DELETION_FAILED",
  ACCOUNT_DELETED = "ACCOUNT_DELETED",
  AUTH_PASSWORD_RESET_REQUESTED = "AUTH_PASSWORD_RESET_REQUESTED",
  AUTH_PASSWORD_RESET_COMPLETED = "AUTH_PASSWORD_RESET_COMPLETED",
  AUTH_PASSWORD_RESET_FAILED = "AUTH_PASSWORD_RESET_FAILED",
  AUTH_EMAIL_VERIFICATION_REQUESTED = "AUTH_EMAIL_VERIFICATION_REQUESTED",
  ADMIN_QUEUE_READ = "ADMIN_QUEUE_READ",
  ADMIN_ROLE_GRANTED = "ADMIN_ROLE_GRANTED",
  APPEAL_GENERATED = "APPEAL_GENERATED",
  APPEAL_APPROVED = "APPEAL_APPROVED",
  ACTION_PROPOSED = "ACTION_PROPOSED",
  ACTION_APPROVED = "ACTION_APPROVED",
  ACTION_PREPARED = "ACTION_PREPARED",
  ACTION_EXECUTED = "ACTION_EXECUTED",
  ACTION_VERIFICATION_FAILED = "ACTION_VERIFICATION_FAILED",
  ACTION_CANCELLED = "ACTION_CANCELLED",
  EMAIL_INBOUND_ACCEPTED = "EMAIL_INBOUND_ACCEPTED",
  EMAIL_INBOUND_REJECTED = "EMAIL_INBOUND_REJECTED",
  EMAIL_OUTBOUND_ACCEPTED = "EMAIL_OUTBOUND_ACCEPTED",
  EMAIL_OUTBOUND_FAILED = "EMAIL_OUTBOUND_FAILED",
  RESPONSE_ANALYZED = "RESPONSE_ANALYZED",
  CASE_REPLANNED = "CASE_REPLANNED",
  DEADLINE_CREATED = "DEADLINE_CREATED",
  NOTIFICATION_CREATED = "NOTIFICATION_CREATED",
  NOTIFICATION_SENT = "NOTIFICATION_SENT",
}

export enum AuditOutcome {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
}

export type AuditValue = string | number | boolean | null;
export type AuditMetadata = Record<string, AuditValue>;

@Schema({ collection: "audit_logs", timestamps: true })
export class AuditLog {
  @Prop({ default: null, ref: "User", type: SchemaTypes.ObjectId })
  userId!: Types.ObjectId | null;

  @Prop({ enum: Object.values(AuditEventType), required: true, type: String })
  eventType!: AuditEventType;

  @Prop({ enum: Object.values(AuditOutcome), required: true, type: String })
  outcome!: AuditOutcome;

  @Prop({ default: null, type: String })
  errorCode!: string | null;

  @Prop({ default: null, type: String })
  requestId!: string | null;

  @Prop({ default: null, type: String })
  correlationId!: string | null;

  @Prop({ default: null, type: String })
  ipHash!: string | null;

  @Prop({ default: null, type: String })
  userAgent!: string | null;

  @Prop({ default: () => ({}), type: Object })
  metadata!: AuditMetadata;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "audit_logs_user_created" },
);
AuditLogSchema.index(
  { eventType: 1, createdAt: -1 },
  { name: "audit_logs_event_created" },
);
