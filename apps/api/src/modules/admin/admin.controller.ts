import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { getRequestContext } from "@recourse/logger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AccessTokenGuard } from "../auth/guards/access-token.guard";
import { StaffGuard } from "../auth/guards/staff.guard";
import { type AuthenticatedUser } from "../auth/auth.types";
import {
  AuditEventType,
  AuditOutcome,
} from "../audit/schemas/audit-log.schema";
import { AuditLogService } from "../audit/audit.service";
import { JobFailureService } from "../queues/job-failure.service";
import { QueueHealthService } from "../queues/queue-health.service";

@Controller("admin/queues")
@UseGuards(AccessTokenGuard, StaffGuard)
export class AdminController {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly failures: JobFailureService,
    private readonly health: QueueHealthService,
  ) {}

  @Get("health")
  async queueHealth(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ queues: Awaited<ReturnType<QueueHealthService["getHealth"]>> }> {
    await this.auditRead(currentUser, "queue_health");
    return { queues: await this.health.getHealth() };
  }

  @Get("failures")
  async failuresList(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query("limit") limit?: string,
  ) {
    await this.auditRead(currentUser, "queue_failures");
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 100;
    const failures = await this.failures.list(
      Number.isFinite(parsedLimit) ? parsedLimit : 100,
    );

    return {
      items: failures.map((failure) => ({
        attemptsMade: failure.attemptsMade,
        caseId: failure.caseId?.toString() ?? null,
        category: failure.category,
        code: failure.code,
        createdAt: failure.createdAt,
        evidenceId: failure.evidenceId?.toString() ?? null,
        jobId: failure.jobId,
        jobName: failure.jobName,
        message: failure.message,
        queue: failure.queue,
      })),
    };
  }

  private async auditRead(
    currentUser: AuthenticatedUser,
    resource: string,
  ): Promise<void> {
    const context = getRequestContext();
    await this.auditLog.record(
      AuditEventType.ADMIN_QUEUE_READ,
      {
        correlationId: context?.correlationId,
        requestId: context?.requestId,
        userId: currentUser.userId,
      },
      AuditOutcome.SUCCESS,
      { resource },
    );
  }
}
