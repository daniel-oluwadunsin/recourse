import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { type Request, type Response } from "express";
import { Model, Types } from "mongoose";

import { type CaseEventType } from "@recourse/contracts";
import { type EnvironmentConfig } from "@recourse/config";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { ActivityPubSubService } from "../queues/activity-pubsub.service";
import { CaseEventService } from "./case-events.service";
import { Case } from "./schemas/case.schema";

const MAX_REPLAY_BATCH = 100;

@Injectable()
export class CaseActivityService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    private readonly caseEventService: CaseEventService,
    private readonly ownership: OwnershipAuthorizationService,
    private readonly activityPubSub: ActivityPubSubService,
    private readonly config: ConfigService<EnvironmentConfig>,
  ) {}

  async stream(
    ownerId: string,
    caseId: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new NotFoundException("Case not found.");
    }

    const ownedCase = await this.caseModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: new Types.ObjectId(caseId),
          deletedAt: null,
        }),
      )
      .select({ _id: 1 })
      .exec();
    if (!ownedCase) {
      throw new NotFoundException("Case not found.");
    }

    const requestedSequence = parseLastEventId(request.get("last-event-id"));
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    const heartbeat = setInterval(
      () => {
        if (!response.writableEnded) {
          response.write(": heartbeat\n\n");
        }
      },
      this.config.get("SSE_HEARTBEAT_INTERVAL_MS") ?? 15000,
    );

    let lastSequence = requestedSequence;
    let draining = false;
    let closed = false;

    const writeEvents = async (): Promise<void> => {
      if (closed || draining) {
        return;
      }
      draining = true;
      try {
        while (!closed) {
          const events = await this.caseEventService.listForCase(
            caseId,
            lastSequence,
            MAX_REPLAY_BATCH,
          );
          if (events.length === 0) {
            break;
          }

          for (const event of events) {
            if (closed || response.writableEnded) {
              break;
            }
            response.write(formatSseEvent(event));
            lastSequence = event.sequence;
          }

          if (events.length < MAX_REPLAY_BATCH) {
            break;
          }
        }
      } finally {
        draining = false;
      }
    };

    const unsubscribe = this.activityPubSub.on((notification) => {
      if (notification.caseId === caseId) {
        void writeEvents();
      }
    });

    const close = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };

    request.once("close", close);
    response.once("close", close);
    response.write(`retry: ${this.config.get("SSE_RETRY_MS") ?? 5000}\n\n`);
    await writeEvents();
  }
}

function parseLastEventId(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000_000
    ? parsed
    : 0;
}

function formatSseEvent(event: {
  _id: Types.ObjectId;
  caseId: Types.ObjectId;
  sequence: number;
  type: CaseEventType;
  actorType: string;
  createdAt: Date;
  payload: Record<string, unknown>;
}): string {
  const data = {
    actorType: event.actorType,
    caseId: event.caseId.toString(),
    createdAt: event.createdAt.toISOString(),
    id: event._id.toString(),
    payload: safePayload(event.payload),
    sequence: event.sequence,
    type: event.type,
  };

  return [
    `id: ${event.sequence}`,
    `event: ${eventName(event.type)}`,
    `data: ${JSON.stringify(data)}`,
    "",
    "",
  ].join("\n");
}

function eventName(type: CaseEventType): string {
  const words = type.toLowerCase().split("_");
  return words.map((word, index) => (index === 0 ? word : `.${word}`)).join("");
}

function safePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set([
    "blockCount",
    "changedFields",
    "decisionRevision",
    "evidenceId",
    "extractionMethod",
    "actionId",
    "appealId",
    "capability",
    "factualGroundingCoverage",
    "gates",
    "procedureVersionId",
    "proceduralGroundingCoverage",
    "revision",
    "titleChanged",
    "tombstoneVersion",
    "failureCode",
    "reason",
  ]);
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = payload[key];
    if (typeof value === "string") {
      result[key] = value.slice(0, 200);
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      result[key] = value.slice(0, 50).map((item) => item.slice(0, 100));
    }
  }
  return result;
}
