import { IsEnum } from "class-validator";

import { appealRequestedOutcomeValues } from "@recourse/contracts";

export class GenerateAppealDto {
  @IsEnum(appealRequestedOutcomeValues)
  requestedOutcome!: (typeof appealRequestedOutcomeValues)[number];
}
