import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { type AuthenticatedUser } from "../auth/auth.types";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { EmailInboundService } from "./email-inbound.service";

@Controller("cases/:caseId/responses")
@UseGuards(AccessTokenGuard)
export class ResponsesController {
  constructor(private readonly inbound: EmailInboundService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.inbound.list(user.userId, caseId);
  }
}
