import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import {
  proceduralClaimTypeValues,
  proceduralClaimVerificationStatusValues,
  sourceAuthorityTierValues,
  type ProceduralClaimType,
  type ProceduralClaimVerificationStatus,
  type SourceAuthorityTier,
} from "@recourse/contracts";

@Schema({ _id: false })
export class ClaimSupport {
  @Prop({ ref: "SourceSnapshot", required: true, type: SchemaTypes.ObjectId })
  sourceSnapshotId!: Types.ObjectId;

  @Prop({ required: true, type: [String] })
  paragraphIds!: string[];

  @Prop({ default: null, ref: "AIRun", type: SchemaTypes.ObjectId })
  verifierRunId!: Types.ObjectId | null;
}

@Schema({ collection: "procedural_claims", timestamps: true })
export class ProceduralClaim {
  @Prop({ ref: "ProcedureVersion", required: true, type: SchemaTypes.ObjectId })
  procedureVersionId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  claimKey!: string;

  @Prop({ enum: [...proceduralClaimTypeValues], required: true, type: String })
  type!: ProceduralClaimType;

  @Prop({ required: true, type: String })
  humanText!: string;

  @Prop({ default: {}, type: Object })
  normalizedValue!: Record<string, unknown>;

  @Prop({
    enum: [...proceduralClaimVerificationStatusValues],
    required: true,
    type: String,
  })
  verificationStatus!: ProceduralClaimVerificationStatus;

  @Prop({ default: null, maxlength: 2000, type: String })
  verificationExplanation!: string | null;

  @Prop({ min: 0, max: 1, required: true, type: Number })
  confidence!: number;

  @Prop({ enum: [...sourceAuthorityTierValues], required: true, type: String })
  authorityTier!: SourceAuthorityTier;

  @Prop({ required: true, type: [ClaimSupport] })
  support!: ClaimSupport[];

  @Prop({ default: [], ref: "ProceduralClaim", type: [SchemaTypes.ObjectId] })
  conflictsWith!: Types.ObjectId[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type ProceduralClaimDocument = HydratedDocument<ProceduralClaim>;
export const ProceduralClaimSchema =
  SchemaFactory.createForClass(ProceduralClaim);

ProceduralClaimSchema.index(
  { procedureVersionId: 1, claimKey: 1 },
  { name: "procedural_claims_version_key_unique", unique: true },
);
ProceduralClaimSchema.index(
  { procedureVersionId: 1, verificationStatus: 1 },
  { name: "procedural_claims_version_status" },
);
ProceduralClaimSchema.index(
  { "support.sourceSnapshotId": 1 },
  { name: "procedural_claims_source_snapshot" },
);
