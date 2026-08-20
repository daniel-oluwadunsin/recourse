import { IsEnum, IsString, MinLength } from "class-validator";

import {
  controlledActionTypeValues,
  submissionCapabilityValues,
} from "@recourse/contracts";

export class CreateActionDto {
  @IsEnum(controlledActionTypeValues)
  actionType!: (typeof controlledActionTypeValues)[number];

  @IsEnum(submissionCapabilityValues)
  capability?: (typeof submissionCapabilityValues)[number];

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
