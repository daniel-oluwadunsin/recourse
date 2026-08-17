import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { getRequestContext } from "@recourse/logger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { type AuthenticatedUser } from "../auth/auth.types";
import { CasesService } from "./cases.service";
import {
  type CaseActor,
  type CreateCaseInput,
  type UpdateCaseInput,
} from "./cases.types";
import { CreateCaseDto } from "./dto/create-case.dto";
import { ListCaseEventsDto } from "./dto/list-case-events.dto";
import { ListCasesDto } from "./dto/list-cases.dto";
import { UpdateCaseDto } from "./dto/update-case.dto";

@Controller("cases")
@UseGuards(AccessTokenGuard)
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Post()
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateCaseDto,
  ) {
    return this.casesService.create(
      currentUser.userId,
      this.toCreateInput(body),
      this.actor(currentUser.userId),
    );
  }

  @Get()
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListCasesDto,
  ) {
    return this.casesService.list(currentUser.userId, {
      cursor: query.cursor,
      institutionId: query.institutionId,
      limit: query.limit,
      status: query.status,
    });
  }

  @Get(":caseId/events")
  async events(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Query() query: ListCaseEventsDto,
  ) {
    return this.casesService.listEvents(currentUser.userId, caseId, {
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get(":caseId")
  async get(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.casesService.get(currentUser.userId, caseId);
  }

  @Patch(":caseId")
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Body() body: UpdateCaseDto,
  ) {
    return this.casesService.update(
      currentUser.userId,
      caseId,
      this.toUpdateInput(body),
      this.actor(currentUser.userId),
    );
  }

  @Delete(":caseId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ): Promise<void> {
    await this.casesService.remove(
      currentUser.userId,
      caseId,
      this.actor(currentUser.userId),
    );
  }

  private actor(userId: string): CaseActor {
    const context = getRequestContext();
    return {
      actorId: userId,
      actorType: "USER",
      correlationId: context?.correlationId,
    };
  }

  private toCreateInput(body: CreateCaseDto): CreateCaseInput {
    return {
      decisionDate: body.decisionDate ?? null,
      decisionType: body.decisionType ?? null,
      financialImpact: body.financialImpact
        ? {
            amount: body.financialImpact.amount ?? null,
            currency: body.financialImpact.currency ?? null,
          }
        : null,
      institutionName: body.institutionName?.trim() || null,
      jurisdiction: body.jurisdiction
        ? {
            countryCode: body.jurisdiction.countryCode ?? null,
            regionCode: body.jurisdiction.regionCode ?? null,
            source: body.jurisdiction.source ?? null,
          }
        : null,
      notificationDate: body.notificationDate ?? null,
      relationship: body.relationship ?? null,
      statedReason: body.statedReason ?? null,
      title: body.title.trim(),
    };
  }

  private toUpdateInput(body: UpdateCaseDto): UpdateCaseInput {
    const corrections = body.corrections
      ? {
          ...(body.corrections.decisionDate !== undefined
            ? { decisionDate: body.corrections.decisionDate }
            : {}),
          ...(body.corrections.decisionType !== undefined
            ? { decisionType: body.corrections.decisionType }
            : {}),
          ...(body.corrections.financialImpact !== undefined
            ? {
                financialImpact: body.corrections.financialImpact
                  ? {
                      amount: body.corrections.financialImpact.amount ?? null,
                      currency:
                        body.corrections.financialImpact.currency ?? null,
                    }
                  : null,
              }
            : {}),
          ...(body.corrections.institutionName !== undefined
            ? { institutionName: body.corrections.institutionName }
            : {}),
          ...(body.corrections.jurisdiction !== undefined
            ? {
                jurisdiction: body.corrections.jurisdiction
                  ? {
                      countryCode:
                        body.corrections.jurisdiction.countryCode ?? null,
                      regionCode:
                        body.corrections.jurisdiction.regionCode ?? null,
                      source: body.corrections.jurisdiction.source ?? null,
                    }
                  : null,
              }
            : {}),
          ...(body.corrections.notificationDate !== undefined
            ? { notificationDate: body.corrections.notificationDate }
            : {}),
          ...(body.corrections.relationship !== undefined
            ? { relationship: body.corrections.relationship }
            : {}),
          ...(body.corrections.statedReason !== undefined
            ? { statedReason: body.corrections.statedReason }
            : {}),
        }
      : undefined;

    return {
      corrections,
      expectedRevision: body.expectedRevision,
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
    };
  }
}
