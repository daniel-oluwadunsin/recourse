import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

import {
  Institution,
  type InstitutionDocument,
} from "./schemas/institution.schema";

export interface TrustedInstitutionInput {
  canonicalName: string;
  aliases?: string[];
  domains?: string[];
  categories?: string[];
  verifiedOfficialDomains?: string[];
}

export interface InstitutionLookupResult {
  normalizedInput: string | null;
  institution: InstitutionDocument | null;
  matchedBy: "CANONICAL_NAME" | "ALIAS" | "NONE";
}

@Injectable()
export class InstitutionLookupService {
  constructor(
    @InjectModel(Institution.name)
    private readonly institutionModel: Model<Institution>,
  ) {}

  async lookup(
    rawName: string | null | undefined,
  ): Promise<InstitutionLookupResult> {
    const normalizedInput = normalizeInstitutionName(rawName);
    if (!normalizedInput) {
      return { institution: null, matchedBy: "NONE", normalizedInput: null };
    }

    const institution = await this.institutionModel
      .findOne({
        $or: [
          { normalizedName: normalizedInput },
          { normalizedAliases: normalizedInput },
        ],
      })
      .exec();

    if (!institution) {
      return { institution: null, matchedBy: "NONE", normalizedInput };
    }

    return {
      institution,
      matchedBy:
        institution.normalizedName === normalizedInput
          ? "CANONICAL_NAME"
          : "ALIAS",
      normalizedInput,
    };
  }

  async registerTrustedCatalogEntry(
    input: TrustedInstitutionInput,
  ): Promise<InstitutionDocument> {
    const aliases = uniqueStrings(input.aliases ?? []);
    const domains = uniqueStrings(input.domains ?? []);
    const categories = uniqueStrings(input.categories ?? []);
    const verifiedOfficialDomains = uniqueStrings(
      input.verifiedOfficialDomains ?? [],
    );

    return this.institutionModel.create({
      aliases,
      canonicalName: input.canonicalName.trim(),
      categories,
      domains,
      normalizedAliases: aliases.map(normalizeInstitutionName),
      normalizedName: normalizeInstitutionName(input.canonicalName),
      verifiedOfficialDomains,
    });
  }
}

export function normalizeInstitutionName(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
