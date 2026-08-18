import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

import { evidenceKindValues, type EvidenceKind } from "@recourse/contracts";

export class CreateUploadIntentDto {
  @IsString()
  @MinLength(1)
  originalFilename!: string;

  @IsString()
  @MinLength(1)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  byteSize!: number;

  @IsEnum(evidenceKindValues)
  kind!: EvidenceKind;

  @IsOptional()
  @IsString()
  @Max(200)
  label?: string | null;
}
