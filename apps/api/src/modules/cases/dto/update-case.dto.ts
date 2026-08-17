import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

import {
  decisionTypeValues,
  relationshipTypeValues,
} from "@recourse/contracts";

import { FinancialImpactDto, JurisdictionRefDto } from "./create-case.dto";

export class DecisionCorrectionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  institutionName?: string | null;

  @IsOptional()
  @IsEnum(relationshipTypeValues)
  relationship?: (typeof relationshipTypeValues)[number] | null;

  @IsOptional()
  @IsEnum(decisionTypeValues)
  decisionType?: (typeof decisionTypeValues)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
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

export class UpdateCaseDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DecisionCorrectionsDto)
  corrections?: DecisionCorrectionsDto;
}
