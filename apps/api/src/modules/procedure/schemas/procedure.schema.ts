import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  procedureStatusValues,
  type ProcedureStatus,
  type RelationshipType,
  type DecisionType,
  relationshipTypeValues,
  decisionTypeValues,
} from "@recourse/contracts";

@Schema({ collection: "procedures", timestamps: true })
export class Procedure {
  @Prop({ default: null, ref: "Institution", type: SchemaTypes.ObjectId })
  institutionId!: Types.ObjectId | null;

  @Prop({ default: null, type: String })
  institutionName!: string | null;

  @Prop({ enum: [...relationshipTypeValues], required: true, type: String })
  relationship!: RelationshipType;

  @Prop({ enum: [...decisionTypeValues], required: true, type: String })
  decisionType!: DecisionType;

  @Prop({ default: null, type: String })
  jurisdictionKey!: string | null;

  @Prop({ required: true, type: String })
  scopeKey!: string;

  @Prop({ default: null, ref: "ProcedureVersion", type: SchemaTypes.ObjectId })
  currentVersionId!: Types.ObjectId | null;

  @Prop({ enum: [...procedureStatusValues], required: true, type: String })
  status!: ProcedureStatus;

  @Prop({ required: true, type: Date })
  firstSeenAt!: Date;

  @Prop({ default: null, type: Date })
  lastVerifiedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ProcedureDocument = HydratedDocument<Procedure>;
export const ProcedureSchema = SchemaFactory.createForClass(Procedure);

ProcedureSchema.index(
  { scopeKey: 1 },
  { name: "procedures_scope_unique", unique: true },
);
ProcedureSchema.index(
  { institutionId: 1, status: 1, updatedAt: -1 },
  { name: "procedures_institution_status" },
);
