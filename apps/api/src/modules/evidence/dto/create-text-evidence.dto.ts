import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { evidenceKindValues, type EvidenceKind } from "@recourse/contracts";

export class CreateTextEvidenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null;

  @IsOptional()
  @IsEnum(evidenceKindValues)
  kind?: EvidenceKind;
}
