import { IsMongoId, IsOptional, IsString } from "class-validator";

export class CompleteUploadDto {
  @IsMongoId()
  evidenceId!: string;

  @IsOptional()
  @IsString()
  sha256?: string;
}
