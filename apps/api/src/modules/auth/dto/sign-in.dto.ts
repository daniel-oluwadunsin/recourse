import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class SignInDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  password!: string;
}
