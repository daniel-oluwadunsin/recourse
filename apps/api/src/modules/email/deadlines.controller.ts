import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { type AuthenticatedUser } from "../auth/auth.types";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { DeadlineService } from "./deadline.service";

@Controller("cases/:caseId/deadlines")
@UseGuards(AccessTokenGuard)
export class DeadlinesController {
  constructor(private readonly deadlines: DeadlineService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.deadlines.list(user.userId, caseId);
  }
}
