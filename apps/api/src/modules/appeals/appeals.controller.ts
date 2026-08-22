import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { type AuthenticatedUser } from "../auth/auth.types";
import { ActionService } from "./action.service";
import { AppealComposerService } from "./appeal-composer.service";
import { CreateActionDto } from "./dto/create-action.dto";
import { GenerateAppealDto } from "./dto/generate-appeal.dto";

@Controller("cases/:caseId")
@UseGuards(AccessTokenGuard)
export class AppealsController {
  constructor(
    private readonly composer: AppealComposerService,
    private readonly actions: ActionService,
  ) {}

  @Post("appeals/generate")
  // @Throttle({ default: { limit: 10, ttl: 3600000 } })
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Body() body: GenerateAppealDto,
  ) {
    return this.composer.compose(user.userId, caseId, body.requestedOutcome);
  }

  @Get("appeals")
  listAppeals(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.actions.listAppeals(user.userId, caseId);
  }

  @Get("appeals/:appealId")
  getAppeal(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("appealId") appealId: string,
  ) {
    return this.actions.getAppeal(user.userId, caseId, appealId);
  }

  @Post("appeals/:appealId/actions")
  createAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("appealId") appealId: string,
    @Body() body: CreateActionDto,
  ) {
    return this.actions.create(user.userId, caseId, appealId, {
      actionType: body.actionType,
      capability: body.capability,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Post("actions/:actionId/approve")
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("actionId") actionId: string,
  ) {
    return this.actions.approve(user.userId, caseId, actionId);
  }

  @Post("actions/:actionId/execute")
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("actionId") actionId: string,
  ) {
    return this.actions.execute(user.userId, caseId, actionId);
  }

  @Post("actions/:actionId/cancel")
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("actionId") actionId: string,
  ) {
    return this.actions.cancel(user.userId, caseId, actionId);
  }
}
