import { Transform } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class SignUpDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  @MinLength(12)
  password!: string;
}
