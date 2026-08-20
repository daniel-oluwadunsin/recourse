import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  IsUppercase,
  Length,
  MinLength,
  ValidateNested,
} from "class-validator";

import {
  decisionTypeValues,
  relationshipTypeValues,
} from "@recourse/contracts";

export class FinancialImpactDto {
  @IsOptional()
  @IsString()
  amount?: string | null;

  @IsOptional()
  @IsString()
  @IsUppercase()
  @Length(3, 3)
  currency?: string | null;
}

export class JurisdictionRefDto {
  @IsOptional()
  @IsISO31661Alpha2()
  countryCode?: string | null;

  @IsOptional()
  @IsString()
  regionCode?: string | null;

  @IsOptional()
  @IsString()
  source?: string | null;
}

export class CreateCaseDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  institutionName?: string | null;

  @IsOptional()
  @IsEnum(relationshipTypeValues)
  relationship?: (typeof relationshipTypeValues)[number] | null;

  @IsOptional()
  @IsEnum(decisionTypeValues)
  decisionType?: (typeof decisionTypeValues)[number] | null;

  @IsOptional()
  @IsString()
  statedReason?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  decisionDate?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  notificationDate?: Date | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => FinancialImpactDto)
  financialImpact?: FinancialImpactDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => JurisdictionRefDto)
  jurisdiction?: JurisdictionRefDto | null;
}
