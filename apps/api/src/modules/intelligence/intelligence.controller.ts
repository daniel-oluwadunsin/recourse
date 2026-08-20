import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { getRequestContext } from "@recourse/logger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { type AuthenticatedUser } from "../auth/auth.types";
import { ClaimService } from "./claim.service";
import { ContradictionService } from "./contradiction.service";
import { CaseIntelligenceService } from "./case-intelligence.service";
import { GraphService } from "./graph.service";
import { RequirementService } from "./requirement.service";
import { TimelineService } from "./timeline.service";
import { AnswerOpenFactsDto } from "./dto/answer-open-facts.dto";

@Controller("cases/:caseId")
@UseGuards(AccessTokenGuard)
export class IntelligenceController {
  constructor(
    private readonly intelligence: CaseIntelligenceService,
    private readonly claims: ClaimService,
    private readonly timeline: TimelineService,
    private readonly requirements: RequirementService,
    private readonly contradictions: ContradictionService,
    private readonly graph: GraphService,
  ) {}

  @Get("claims")
  claimsForCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.claims.listForCase(user.userId, caseId);
  }

  @Get("timeline")
  timelineForCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.timeline.listForCase(user.userId, caseId);
  }

  @Get("requirements")
  requirementsForCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.requirements.listForCase(user.userId, caseId);
  }

  @Get("contradictions")
  contradictionsForCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.contradictions.listForCase(user.userId, caseId);
  }

  @Post("claims/verify-evidence/:evidenceId")
  @HttpCode(HttpStatus.OK)
  verifyEvidenceClaims(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("evidenceId") evidenceId: string,
  ) {
    return this.claims.verifyAgainstEvidence(user.userId, caseId, evidenceId, {
      actorId: user.userId,
      actorType: "USER",
      correlationId: getRequestContext()?.correlationId,
    });
  }

  @Get("graph")
  graphForCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.graph.getForCase(user.userId, caseId);
  }

  @Get("analysis")
  analysisForCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.intelligence.getAnalysis(user.userId, caseId);
  }

  @Post("analysis/retry")
  @HttpCode(HttpStatus.ACCEPTED)
  retryAnalysis(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.intelligence.retryAnalysis(user.userId, caseId, {
      actorId: user.userId,
      actorType: "USER",
      correlationId: getRequestContext()?.correlationId,
    });
  }

  @Post("analysis/approve")
  @HttpCode(HttpStatus.OK)
  approveAnalysis(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
  ) {
    return this.intelligence.approveAnalysis(user.userId, caseId, {
      actorId: user.userId,
      actorType: "USER",
      correlationId: getRequestContext()?.correlationId,
    });
  }

  @Post("analysis/answers")
  @HttpCode(HttpStatus.ACCEPTED)
  answerOpenFacts(
    @CurrentUser() user: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Body() body: AnswerOpenFactsDto,
  ) {
    return this.intelligence.answerOpenFacts(
      user.userId,
      caseId,
      body.answers,
      {
        actorId: user.userId,
        actorType: "USER",
        correlationId: getRequestContext()?.correlationId,
      },
    );
  }
}
