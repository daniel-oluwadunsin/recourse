import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";

import {
  AuditEventType,
  AuditLog,
  AuditOutcome,
  type AuditMetadata,
} from "./schemas/audit-log.schema";

export interface AuditContext {
  userId?: string;
  requestId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
}

const sensitiveKeyPattern =
  /(password|token|secret|authorization|cookie|api[-_]?key)/i;

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLog>,
  ) {}

  async record(
    eventType: AuditEventType,
    context: AuditContext,
    outcome: AuditOutcome,
    metadata: AuditMetadata = {},
    errorCode?: string,
  ): Promise<void> {
    const userId =
      context.userId && isValidObjectId(context.userId)
        ? new Types.ObjectId(context.userId)
        : null;

    await this.auditLogModel.create({
      userId,
      eventType,
      outcome,
      errorCode: errorCode ?? null,
      requestId: context.requestId ?? null,
      correlationId: context.correlationId ?? null,
      ipHash: context.ipAddress ? this.hashIp(context.ipAddress) : null,
      userAgent: context.userAgent?.slice(0, 512) ?? null,
      metadata: this.sanitizeMetadata(metadata),
    });
  }

  private hashIp(ipAddress: string): string {
    return createHash("sha256").update(ipAddress).digest("hex");
  }

  private sanitizeMetadata(metadata: AuditMetadata): AuditMetadata {
    const sanitized: AuditMetadata = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (sensitiveKeyPattern.test(key)) {
        continue;
      }

      sanitized[key] = typeof value === "string" ? value.slice(0, 256) : value;
    }

    return sanitized;
  }
}
