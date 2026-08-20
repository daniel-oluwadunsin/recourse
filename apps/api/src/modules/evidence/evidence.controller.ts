import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { getRequestContext } from "@recourse/logger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { configuredRateLimit } from "../../common/security/rate-limit";
import { type AuthenticatedUser } from "../auth/auth.types";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { CompleteUploadDto } from "./dto/complete-upload.dto";
import { CreateTextEvidenceDto } from "./dto/create-text-evidence.dto";
import { CreateUploadIntentDto } from "./dto/create-upload-intent.dto";
import { ListEvidenceDto } from "./dto/list-evidence.dto";
import { EvidenceService } from "./evidence.service";

@Controller("cases/:caseId/evidence")
@UseGuards(AccessTokenGuard)
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post("upload-intent")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("UPLOAD_RATE_LIMIT"),
      ttl: 60000,
    },
  })
  async createUploadIntent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Body() body: CreateUploadIntentDto,
  ) {
    return this.evidenceService.createUploadIntent(currentUser.userId, caseId, {
      byteSize: body.byteSize,
      kind: body.kind,
      label: body.label,
      mimeType: body.mimeType,
      originalFilename: body.originalFilename,
    });
  }

  @Post("complete")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("UPLOAD_RATE_LIMIT"),
      ttl: 60000,
    },
  })
  async completeUpload(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Body() body: CompleteUploadDto,
  ) {
    return this.evidenceService.completeUpload(
      currentUser.userId,
      caseId,
      body,
      this.actor(currentUser.userId),
    );
  }

  @Post("text")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("UPLOAD_RATE_LIMIT"),
      ttl: 60000,
    },
  })
  async createTextEvidence(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Body() body: CreateTextEvidenceDto,
  ) {
    return this.evidenceService.createTextEvidence(
      currentUser.userId,
      caseId,
      body,
      this.actor(currentUser.userId),
    );
  }

  @Get()
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Query() query: ListEvidenceDto,
  ) {
    return this.evidenceService.list(currentUser.userId, caseId, {
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get(":evidenceId")
  async get(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("evidenceId") evidenceId: string,
  ) {
    return this.evidenceService.get(currentUser.userId, caseId, evidenceId);
  }

  @Get(":evidenceId/download")
  async download(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("evidenceId") evidenceId: string,
  ) {
    return this.evidenceService.downloadAccess(
      currentUser.userId,
      caseId,
      evidenceId,
    );
  }

  @Get(":evidenceId/blocks")
  async blocks(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("evidenceId") evidenceId: string,
  ) {
    return this.evidenceService.listBlocks(
      currentUser.userId,
      caseId,
      evidenceId,
    );
  }

  @Delete(":evidenceId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("caseId") caseId: string,
    @Param("evidenceId") evidenceId: string,
  ): Promise<void> {
    await this.evidenceService.delete(
      currentUser.userId,
      caseId,
      evidenceId,
      this.actor(currentUser.userId),
    );
  }

  private actor(userId: string) {
    const context = getRequestContext();
    return {
      actorId: userId,
      actorType: "USER" as const,
      correlationId: context?.correlationId,
    };
  }
}
