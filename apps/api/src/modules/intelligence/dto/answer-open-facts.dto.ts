import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class OpenFactAnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  question!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  answer!: string;
}

export class AnswerOpenFactsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OpenFactAnswerDto)
  answers!: OpenFactAnswerDto[];
}
