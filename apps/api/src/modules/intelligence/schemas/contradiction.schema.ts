import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  contradictionKindValues,
  contradictionStatusValues,
  type ContradictionKind,
  type ContradictionStatus,
} from "@recourse/contracts";

@Schema({ collection: "contradictions", timestamps: true })
export class Contradiction {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "User", required: true, type: SchemaTypes.ObjectId })
  ownerId!: Types.ObjectId;

  @Prop({ ref: "Claim", required: true, type: SchemaTypes.ObjectId })
  claimAId!: Types.ObjectId;

  @Prop({ ref: "Claim", required: true, type: SchemaTypes.ObjectId })
  claimBId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  candidateKey!: string;

  @Prop({ enum: [...contradictionKindValues], required: true, type: String })
  kind!: ContradictionKind;

  @Prop({ enum: [...contradictionStatusValues], required: true, type: String })
  status!: ContradictionStatus;

  @Prop({ enum: ["LOW", "MEDIUM", "HIGH"], required: true, type: String })
  severity!: "LOW" | "MEDIUM" | "HIGH";

  @Prop({ required: true, type: String })
  explanation!: string;

  @Prop({ required: true, type: Boolean })
  deterministicCandidate!: boolean;

  @Prop({ default: null, ref: "AIRun", type: SchemaTypes.ObjectId })
  modelRunId!: Types.ObjectId | null;

  @Prop({ default: [], type: [String] })
  resolutionRefs!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type ContradictionDocument = HydratedDocument<Contradiction>;
export const ContradictionSchema = SchemaFactory.createForClass(Contradiction);

ContradictionSchema.index(
  { caseId: 1, candidateKey: 1, kind: 1 },
  { name: "contradictions_case_candidate_kind_unique", unique: true },
);
ContradictionSchema.index(
  { caseId: 1, status: 1, severity: 1, updatedAt: -1 },
  { name: "contradictions_case_status_severity" },
);
ContradictionSchema.index(
  { caseId: 1, claimAId: 1, claimBId: 1 },
  { name: "contradictions_case_claim_pair" },
);
