import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  token!: string;
}
