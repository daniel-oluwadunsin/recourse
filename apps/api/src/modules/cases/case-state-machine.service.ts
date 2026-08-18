import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { ClientSession, Connection, Model, Types } from "mongoose";

import {
  caseStatusValues,
  type CaseEventType,
  type CaseStatus,
} from "@recourse/contracts";

import {
  CaseTombstonedError,
  InvalidCaseTransitionError,
} from "./cases.errors";
import { type CaseActor, type CaseTransitionResult } from "./cases.types";
import { CaseEventService } from "./case-events.service";
import { Case } from "./schemas/case.schema";

export const allowedCaseTransitions: Readonly<
  Record<CaseStatus, readonly CaseStatus[]>
> = {
  AWAITING_RESPONSE: ["RESPONSE_RECEIVED"],
  AWAITING_USER_APPROVAL: ["READY_TO_APPEAL", "SUBMITTED"],
  CASE_ANALYSIS: ["EVIDENCE_COLLECTION", "READY_TO_APPEAL", "NEEDS_HUMAN"],
  CLASSIFYING: ["PROCEDURE_RESOLUTION"],
  EVIDENCE_COLLECTION: ["CASE_ANALYSIS"],
  EXHAUSTED: [],
  INTAKE: ["CLASSIFYING"],
  NEEDS_HUMAN: [],
  PROCEDURE_RESOLUTION: ["EVIDENCE_COLLECTION"],
  READY_TO_APPEAL: ["AWAITING_USER_APPROVAL"],
  REPLANNING: [
    "EVIDENCE_COLLECTION",
    "READY_TO_APPEAL",
    "AWAITING_USER_APPROVAL",
    "RESOLVED",
    "EXHAUSTED",
    "NEEDS_HUMAN",
  ],
  RESOLVED: [],
  RESPONSE_RECEIVED: ["REPLANNING"],
  SUBMITTED: ["AWAITING_RESPONSE"],
};

export interface TransitionOptions {
  eventType?: CaseEventType;
  expectedCurrent?: readonly CaseStatus[];
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
  expectedRevision?: number;
}

@Injectable()
export class CaseStateMachineService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    private readonly caseEventService: CaseEventService,
  ) {}

  canTransition(from: CaseStatus, to: CaseStatus): boolean {
    return allowedCaseTransitions[from].includes(to);
  }

  async transition(
    caseId: string,
    to: CaseStatus,
    actor: CaseActor,
    options: TransitionOptions = {},
  ): Promise<CaseTransitionResult> {
    return this.connection.transaction(async (session) => {
      const duplicate = options.idempotencyKey
        ? await this.caseEventService.findByIdempotencyKey(
            caseId,
            options.idempotencyKey,
            session,
          )
        : null;
      if (duplicate) {
        const existingCase = await this.caseModel
          .findOne({ _id: this.toObjectId(caseId) })
          .session(session)
          .exec();
        if (!existingCase) {
          throw new NotFoundException("Case not found.");
        }
        return { case: existingCase, event: duplicate, idempotent: true };
      }

      const current = await this.caseModel
        .findOne({ _id: this.toObjectId(caseId), deletedAt: null })
        .session(session)
        .exec();
      if (!current) {
        await this.throwMissingOrTombstonedCase(caseId, session);
        throw new NotFoundException("Case not found.");
      }

      if (
        options.expectedCurrent &&
        !options.expectedCurrent.includes(current.status)
      ) {
        throw new InvalidCaseTransitionError(current.status, to);
      }

      if (
        options.expectedRevision !== undefined &&
        current.revision !== options.expectedRevision
      ) {
        throw new InvalidCaseTransitionError(current.status, to);
      }

      if (!this.canTransition(current.status, to)) {
        throw new InvalidCaseTransitionError(current.status, to);
      }

      const event = await this.caseEventService.appendInSession(
        {
          actor,
          caseId,
          idempotencyKey: options.idempotencyKey,
          payload: {
            from: current.status,
            to,
            ...options.payload,
          },
          type: options.eventType ?? "CASE_STATUS_CHANGED",
        },
        session,
      );

      const updated = await this.caseModel
        .findOneAndUpdate(
          {
            _id: current._id,
            deletedAt: null,
            revision: current.revision,
          },
          {
            $inc: { revision: 1 },
            $set: { currentStage: to, status: to },
          },
          { returnDocument: "after", session },
        )
        .exec();
      if (!updated) {
        throw new InvalidCaseTransitionError(current.status, to);
      }

      return { case: updated, event, idempotent: false };
    });
  }

  private async throwMissingOrTombstonedCase(
    caseId: string,
    session: ClientSession,
  ): Promise<never> {
    const current = await this.caseModel
      .findOne({ _id: this.toObjectId(caseId) })
      .session(session)
      .select({ _id: 1, deletedAt: 1 })
      .exec();
    if (current?.deletedAt) {
      throw new CaseTombstonedError();
    }
    throw new NotFoundException("Case not found.");
  }

  private toObjectId(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new NotFoundException("Case not found.");
    }
    return new Types.ObjectId(value);
  }
}

export const allCaseStatuses = caseStatusValues;
