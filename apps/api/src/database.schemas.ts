import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { SchemaTypes, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'users' })
export class UserRecord {
  _id!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  })
  email!: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  aiConsent!: { version: string; acceptedAt: Date } | null;

  createdAt!: Date;
  updatedAt!: Date;
}
export const UserSchema = SchemaFactory.createForClass(UserRecord);
export type UserDocument = HydratedDocument<UserRecord>;

@Schema({ timestamps: true, collection: 'refresh_sessions' })
export class RefreshSessionRecord {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true, index: true })
  tokenHash!: string;

  @Prop({ type: String, required: true, index: true })
  familyId!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}
export const RefreshSessionSchema =
  SchemaFactory.createForClass(RefreshSessionRecord);
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ timestamps: true, collection: 'cases', optimisticConcurrency: true })
export class CaseRecord {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, default: 'Untitled case' })
  title!: string;

  @Prop({ type: String, required: true, default: 'NEW', index: true })
  status!: string;

  @Prop({ type: String, default: '' })
  decisionText!: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  classification!: Record<string, unknown> | null;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  clarifications!: Array<Record<string, unknown>>;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  research!: Record<string, unknown> | null;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  analysis!: Record<string, unknown> | null;

  @Prop({ type: SchemaTypes.Mixed, default: { email: [], letter: [] } })
  drafts!: {
    email: Array<Record<string, unknown>>;
    letter: Array<Record<string, unknown>>;
  };

  @Prop({ type: SchemaTypes.Mixed, default: null })
  submission!: Record<string, unknown> | null;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  responses!: Array<Record<string, unknown>>;

  @Prop({ type: SchemaTypes.Mixed, default: { status: 'idle' } })
  processing!: Record<string, unknown>;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  activity!: Array<Record<string, unknown>>;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  deletion!: Record<string, unknown> | null;

  createdAt!: Date;
  updatedAt!: Date;
}
export const CaseSchema = SchemaFactory.createForClass(CaseRecord);
CaseSchema.index({ userId: 1, updatedAt: -1 });
export type CaseDocument = HydratedDocument<CaseRecord>;

@Schema({ timestamps: true, collection: 'documents' })
export class DocumentRecord {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  caseId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  purpose!: string;

  @Prop({ type: String, required: true })
  filename!: string;

  @Prop({ type: String, required: true })
  mimeType!: string;

  @Prop({ type: Number, required: true })
  size!: number;

  @Prop({ type: String, required: true })
  sha256!: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  cloudinary!: Record<string, unknown> | null;

  @Prop({ type: String, default: '' })
  extractedText!: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  extraction!: Record<string, unknown> | null;

  @Prop({ type: String, required: true, default: 'uploaded' })
  processingStatus!: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  error!: Record<string, unknown> | null;

  createdAt!: Date;
  updatedAt!: Date;
}
export const DocumentSchema = SchemaFactory.createForClass(DocumentRecord);
DocumentSchema.index({ caseId: 1, purpose: 1, sha256: 1 }, { unique: true });
export type DocumentDocument = HydratedDocument<DocumentRecord>;

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessageRecord {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  caseId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  role!: 'user' | 'assistant';

  @Prop({ type: String, required: true })
  content!: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata!: Record<string, unknown> | null;

  createdAt!: Date;
  updatedAt!: Date;
}
export const ChatMessageSchema =
  SchemaFactory.createForClass(ChatMessageRecord);
ChatMessageSchema.index({ caseId: 1, createdAt: 1 });

@Schema({ timestamps: true, collection: 'research_cache' })
export class ResearchCacheRecord {
  _id!: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true, index: true })
  cacheKey!: string;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  result!: Record<string, unknown>;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}
export const ResearchCacheSchema =
  SchemaFactory.createForClass(ResearchCacheRecord);
ResearchCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
