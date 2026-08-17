import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  ClientSession,
  Connection,
  isValidObjectId,
  Model,
  Types,
} from "mongoose";

import { CaseEvent, type CaseEventDocument } from "./schemas/case-event.schema";
import { Case } from "./schemas/case.schema";
import { type AppendCaseEventInput } from "./cases.types";
import { CaseTombstonedError } from "./cases.errors";

@Injectable()
export class CaseEventService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(CaseEvent.name)
    private readonly caseEventModel: Model<CaseEvent>,
  ) {}

  async append(input: AppendCaseEventInput): Promise<CaseEventDocument> {
    const normalizedKey = normalizeIdempotencyKey(input.idempotencyKey);

    try {
      return await this.connection.transaction((session) =>
        this.appendInSession(
          { ...input, idempotencyKey: normalizedKey ?? undefined },
          session,
        ),
      );
    } catch (error: unknown) {
      if (normalizedKey && isMongoDuplicateKeyError(error)) {
        const existing = await this.findByIdempotencyKey(
          input.caseId,
          normalizedKey,
        );
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  async appendInSession(
    input: AppendCaseEventInput,
    session: ClientSession,
  ): Promise<CaseEventDocument> {
    const caseId = this.toObjectId(input.caseId);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

    if (idempotencyKey) {
      const existing = await this.caseEventModel
        .findOne({ caseId, idempotencyKey })
        .session(session)
        .exec();
      if (existing) {
        return existing;
      }
    }

    const currentCase = await this.caseModel
      .findOne({ _id: caseId, deletedAt: null })
      .session(session)
      .exec();
    if (!currentCase) {
      await this.throwMissingOrTombstonedCase(caseId, session);
    }

    const updatedCase = await this.caseModel
      .findOneAndUpdate(
        { _id: caseId, deletedAt: null },
        { $inc: { eventSequence: 1 } },
        { returnDocument: "after", session },
      )
      .exec();

    if (!updatedCase) {
      await this.throwMissingOrTombstonedCase(caseId, session);
      throw new NotFoundException("Case not found.");
    }

    const created = await this.caseEventModel.create(
      [
        {
          actorId: input.actor.actorId,
          actorType: input.actor.actorType,
          caseId,
          correlationId: input.actor.correlationId ?? null,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          payload: input.payload,
          sequence: updatedCase.eventSequence,
          type: input.type,
        },
      ],
      { session },
    );

    const event = created[0];
    if (!event) {
      throw new Error("Case event creation returned no document");
    }

    return event;
  }

  async findByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
    session?: ClientSession,
  ): Promise<CaseEventDocument | null> {
    const query = this.caseEventModel.findOne({
      caseId: this.toObjectId(caseId),
      idempotencyKey: normalizeIdempotencyKey(idempotencyKey),
    });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  async listForCase(
    caseId: string,
    afterSequence: number,
    limit: number,
  ): Promise<CaseEventDocument[]> {
    return this.caseEventModel
      .find({
        caseId: this.toObjectId(caseId),
        sequence: { $gt: afterSequence },
      })
      .sort({ sequence: 1 })
      .limit(limit)
      .exec();
  }

  private async throwMissingOrTombstonedCase(
    caseId: Types.ObjectId,
    session: ClientSession,
  ): Promise<never> {
    const deletedCase = await this.caseModel
      .findOne({ _id: caseId })
      .session(session)
      .select({ _id: 1, deletedAt: 1 })
      .exec();
    if (deletedCase?.deletedAt) {
      throw new CaseTombstonedError();
    }

    throw new NotFoundException("Case not found.");
  }

  private toObjectId(value: string): Types.ObjectId {
    if (!isValidObjectId(value)) {
      throw new NotFoundException("Case not found.");
    }
    return new Types.ObjectId(value);
  }
}

function normalizeIdempotencyKey(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 200) : null;
}

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}
