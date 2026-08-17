import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from "class-validator";

import { caseStatusValues } from "@recourse/contracts";

export class ListCasesDto {
  @IsOptional()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsEnum(caseStatusValues)
  status?: (typeof caseStatusValues)[number];

  @IsOptional()
  @IsMongoId()
  institutionId?: string;
}
