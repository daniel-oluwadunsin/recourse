import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { getRequestContext } from "@recourse/logger";

import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { type AuthenticatedUser } from "../auth/auth.types";
import { ProcedureService } from "./procedure.service";

@Controller("cases/:caseId/procedure")
@UseGuards(AccessTokenGuard)
export class ProcedureController {
  constructor(private readonly procedureService: ProcedureService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param("caseId") caseId: string) {
    return this.procedureService.getForCase(user.userId, caseId);
  }

  @Get("sources")
  sources(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.procedureService.sourcesForCase(user.userId, caseId);
  }

  @Get("claims")
  claims(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.procedureService.claimsForCase(user.userId, caseId);
  }

  @Get("runs")
  runs(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.procedureService.runsForCase(user.userId, caseId);
  }

  @Post("retry")
  @HttpCode(HttpStatus.ACCEPTED)
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.procedureService.retryResolution(user.userId, caseId, {
      actorId: user.userId,
      actorType: "USER",
      correlationId: getRequestContext()?.correlationId,
    });
  }
}
