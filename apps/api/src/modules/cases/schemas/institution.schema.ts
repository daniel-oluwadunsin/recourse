import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema({ collection: "institutions", timestamps: true })
export class Institution {
  @Prop({ required: true, trim: true, type: String })
  canonicalName!: string;

  @Prop({ required: true, trim: true, type: String })
  normalizedName!: string;

  @Prop({ default: () => [], type: [String] })
  domains!: string[];

  @Prop({ default: () => [], type: [String] })
  aliases!: string[];

  @Prop({ default: () => [], type: [String] })
  normalizedAliases!: string[];

  @Prop({ default: () => [], type: [String] })
  categories!: string[];

  @Prop({ default: () => [], type: [String] })
  verifiedOfficialDomains!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type InstitutionDocument = HydratedDocument<Institution>;

export const InstitutionSchema = SchemaFactory.createForClass(Institution);

InstitutionSchema.index(
  { normalizedName: 1 },
  { name: "institutions_normalized_name_unique", unique: true },
);
InstitutionSchema.index(
  { normalizedAliases: 1 },
  { name: "institutions_normalized_aliases" },
);
InstitutionSchema.index(
  { verifiedOfficialDomains: 1 },
  { name: "institutions_verified_domains" },
);
