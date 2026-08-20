import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class ListEvidenceDto {
  @IsOptional()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 20;
}
