import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  ClientSession,
  Connection,
  isValidObjectId,
  Model,
  Types,
} from "mongoose";
import { randomUUID } from "node:crypto";

import {
  decisionFieldSnapshotSchema,
  type CaseStatus,
} from "@recourse/contracts";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { CaseEventService } from "./case-events.service";
import { type CaseEventDocument } from "./schemas/case-event.schema";
import { CaseTombstonedError, StaleCaseRevisionError } from "./cases.errors";
import {
  decodeCaseCursor,
  decodeEventCursor,
  encodeCaseCursor,
  encodeEventCursor,
} from "./cursor";
import {
  applyDecisionCorrection,
  toDecisionCorrection,
  toDecisionSnapshot,
} from "./decision-fields";
import { InstitutionLookupService } from "./institutions.service";
import { Case, type CaseDocument } from "./schemas/case.schema";
import { Decision, type DecisionDocument } from "./schemas/decision.schema";
import { toPublicFinancialImpact } from "./schemas/financial-impact.schema";
import {
  type CaseActor,
  type CaseWithDecision,
  type CreateCaseInput,
  type PublicCase,
  type PublicCaseEvent,
  type PublicDecision,
  type UpdateCaseInput,
} from "./cases.types";

const MAX_CASE_PAGE_SIZE = 50;
const MAX_EVENT_PAGE_SIZE = 100;

@Injectable()
export class CasesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Decision.name) private readonly decisionModel: Model<Decision>,
    private readonly caseEventService: CaseEventService,
    private readonly institutionLookupService: InstitutionLookupService,
    private readonly ownershipAuthorizationService: OwnershipAuthorizationService,
  ) {}

  async create(
    ownerId: string,
    input: CreateCaseInput,
    actor: CaseActor,
  ): Promise<PublicCase> {
    const title = input.title.trim();
    if (!title) {
      throw new BadRequestException("Case title is required.");
    }

    const institution = await this.institutionLookupService.lookup(
      input.institutionName,
    );
    const rawFields = decisionFieldSnapshotSchema.parse({
      decisionDate: input.decisionDate,
      financialImpact: input.financialImpact,
      institutionName: input.institutionName,
      jurisdiction: input.jurisdiction,
      notificationDate: input.notificationDate,
      relationship: input.relationship,
      statedReason: input.statedReason,
      decisionType: input.decisionType,
    });

    const created = await this.connection.transaction(async (session) => {
      const [createdCase] = await this.caseModel.create(
        [
          {
            activeProcedureId: null,
            activeProcedureVersionId: null,
            caseKey: createCaseKey(),
            contradictionCount: 0,
            currentStage: "INTAKE",
            decisionDate: rawFields.decisionDate,
            deletedAt: null,
            eventSequence: 0,
            financialImpact: rawFields.financialImpact,
            graphVersion: 0,
            institutionId: institution.institution?._id ?? null,
            institutionNameRaw: rawFields.institutionName,
            nextRecommendedActionId: null,
            notificationDate: rawFields.notificationDate,
            openCriticalGapCount: 0,
            ownerId: new Types.ObjectId(ownerId),
            readiness: {
              computedAt: null,
              factors: [],
              score: 0,
              version: "v1",
            },
            revision: 0,
            statedReason: rawFields.statedReason,
            status: "INTAKE",
            title,
            tombstoneVersion: 0,
          },
        ],
        { session },
      );

      if (!createdCase) {
        throw new Error("Case creation returned no document");
      }

      const [createdDecision] = await this.decisionModel.create(
        [
          {
            caseId: createdCase._id,
            decisionDate: rawFields.decisionDate,
            decisionType: rawFields.decisionType,
            financialImpact: rawFields.financialImpact,
            institutionName: rawFields.institutionName,
            jurisdiction: rawFields.jurisdiction,
            modelRunId: null,
            notificationDate: rawFields.notificationDate,
            rawExtractedFields: rawFields,
            relationship: rawFields.relationship,
            revision: 0,
            sourceEvidenceId: null,
            statedReason: rawFields.statedReason,
            userCorrectedFields: {},
          },
        ],
        { session },
      );

      if (!createdDecision) {
        throw new Error("Decision creation returned no document");
      }

      await this.caseEventService.appendInSession(
        {
          actor,
          caseId: createdCase._id.toString(),
          payload: {
            caseKey: createdCase.caseKey,
            decisionId: createdDecision._id.toString(),
          },
          type: "CASE_CREATED",
        },
        session,
      );

      return { case: createdCase, decision: createdDecision };
    });

    return this.toPublicCase(created);
  }

  async list(
    ownerId: string,
    options: {
      cursor?: string;
      institutionId?: string;
      limit: number;
      status?: CaseStatus;
    },
  ): Promise<{
    items: PublicCase[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(options.limit, MAX_CASE_PAGE_SIZE);
    const filter: Record<string, unknown> =
      this.ownershipAuthorizationService.withOwnerScope(ownerId, {
        deletedAt: null,
      });

    if (options.status) {
      filter.status = options.status;
    }
    if (options.institutionId) {
      if (!isValidObjectId(options.institutionId)) {
        throw new BadRequestException("institutionId is invalid.");
      }
      filter.institutionId = new Types.ObjectId(options.institutionId);
    }

    const cursor = options.cursor
      ? decodeCaseCursor(options.cursor)
      : undefined;
    if (options.cursor && !cursor) {
      throw new BadRequestException("cursor is invalid.");
    }
    if (cursor) {
      filter.$or = [
        { updatedAt: { $lt: new Date(cursor.updatedAt) } },
        {
          _id: { $lt: new Types.ObjectId(cursor.id) },
          updatedAt: new Date(cursor.updatedAt),
        },
      ];
    }

    const documents = await this.caseModel
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = documents.length > limit;
    const items = documents
      .slice(0, limit)
      .map((document) => this.toPublicCase({ case: document }));
    const last = documents[limit - 1];

    return {
      hasMore,
      items,
      nextCursor:
        hasMore && last
          ? encodeCaseCursor({
              id: last._id.toString(),
              updatedAt: last.updatedAt.toISOString(),
              version: 1,
            })
          : null,
    };
  }

  async get(ownerId: string, caseId: string): Promise<PublicCase> {
    return this.toPublicCase(
      await this.findOwnedCaseWithDecision(ownerId, caseId),
    );
  }

  async update(
    ownerId: string,
    caseId: string,
    input: UpdateCaseInput,
    actor: CaseActor,
  ): Promise<PublicCase> {
    if (
      !input.title &&
      (!input.corrections || Object.keys(input.corrections).length === 0)
    ) {
      throw new BadRequestException("No case changes were supplied.");
    }

    const updated = await this.connection.transaction(async (session) => {
      const current = await this.findOwnedCase(ownerId, caseId, session);
      if (current.revision !== input.expectedRevision) {
        throw new StaleCaseRevisionError();
      }

      const corrections = input.corrections
        ? toDecisionCorrection(input.corrections)
        : undefined;
      const hasCorrections = corrections && Object.keys(corrections).length > 0;
      const decision = hasCorrections
        ? await this.findDecision(caseId, session)
        : null;
      const effective =
        decision && corrections
          ? applyDecisionCorrection(
              toDecisionSnapshot(decision.rawExtractedFields),
              toDecisionCorrection(decision.userCorrectedFields),
              corrections,
            )
          : null;
      const update: Record<string, unknown> = {
        $inc: { revision: 1 },
        $set: {},
      };
      const set = update.$set as Record<string, unknown>;

      if (input.title !== undefined) {
        const title = input.title.trim();
        if (!title) {
          throw new BadRequestException("Case title is required.");
        }
        set.title = title;
      }
      if (effective) {
        const institution = await this.institutionLookupService.lookup(
          effective.institutionName,
        );
        set.decisionDate = effective.decisionDate;
        set.decisionType = effective.decisionType;
        set.financialImpact = effective.financialImpact;
        set.institutionId = institution.institution?._id ?? null;
        set.institutionNameRaw = effective.institutionName;
        set.jurisdiction = effective.jurisdiction;
        set.notificationDate = effective.notificationDate;
        set.relationship = effective.relationship;
        set.statedReason = effective.statedReason;
      }

      const updatedCase = await this.caseModel
        .findOneAndUpdate(
          {
            _id: current._id,
            ownerId: new Types.ObjectId(ownerId),
            deletedAt: null,
            revision: input.expectedRevision,
          },
          update,
          { returnDocument: "after", session },
        )
        .exec();
      if (!updatedCase) {
        throw new StaleCaseRevisionError();
      }

      let updatedDecision = decision;
      if (decision && corrections && effective) {
        updatedDecision = await this.decisionModel
          .findOneAndUpdate(
            { _id: decision._id, caseId: current._id },
            {
              $inc: { revision: 1 },
              $set: {
                decisionDate: effective.decisionDate,
                decisionType: effective.decisionType,
                financialImpact: effective.financialImpact,
                institutionName: effective.institutionName,
                jurisdiction: effective.jurisdiction,
                notificationDate: effective.notificationDate,
                relationship: effective.relationship,
                statedReason: effective.statedReason,
                userCorrectedFields: {
                  ...toDecisionCorrection(decision.userCorrectedFields),
                  ...corrections,
                },
              },
            },
            { returnDocument: "after", session },
          )
          .exec();
      }

      if (hasCorrections) {
        await this.caseEventService.appendInSession(
          {
            actor,
            caseId,
            payload: {
              changedFields: Object.keys(corrections ?? {}),
              corrections,
              decisionRevision: updatedDecision?.revision ?? null,
              revision: updatedCase.revision,
            },
            type: "DECISION_CORRECTED",
          },
          session,
        );
      }
      if (input.title !== undefined) {
        await this.caseEventService.appendInSession(
          {
            actor,
            caseId,
            payload: { revision: updatedCase.revision, titleChanged: true },
            type: "CASE_UPDATED",
          },
          session,
        );
      }

      return { case: updatedCase, decision: updatedDecision };
    });

    return this.toPublicCase(updated);
  }

  async remove(
    ownerId: string,
    caseId: string,
    actor: CaseActor,
  ): Promise<void> {
    await this.connection.transaction(async (session) => {
      const current = await this.findOwnedCaseIncludingDeleted(
        ownerId,
        caseId,
        session,
      );
      if (current.deletedAt) {
        return;
      }

      await this.caseEventService.appendInSession(
        {
          actor,
          caseId,
          payload: {
            revision: current.revision + 1,
            tombstoneVersion: current.tombstoneVersion + 1,
          },
          type: "CASE_DELETED",
        },
        session,
      );

      const deleted = await this.caseModel
        .findOneAndUpdate(
          {
            _id: current._id,
            deletedAt: null,
            ownerId: new Types.ObjectId(ownerId),
            revision: current.revision,
          },
          {
            $inc: { revision: 1, tombstoneVersion: 1 },
            $set: { deletedAt: new Date() },
          },
          { returnDocument: "after", session },
        )
        .exec();
      if (!deleted) {
        throw new StaleCaseRevisionError();
      }
    });
  }

  async listEvents(
    ownerId: string,
    caseId: string,
    options: { cursor?: string; limit: number },
  ): Promise<{
    items: PublicCaseEvent[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    await this.findOwnedCase(ownerId, caseId);
    const limit = Math.min(options.limit, MAX_EVENT_PAGE_SIZE);
    const cursor = options.cursor
      ? decodeEventCursor(options.cursor)
      : { sequence: 0, version: 1 as const };
    if (!cursor) {
      throw new BadRequestException("cursor is invalid.");
    }

    const documents = await this.caseEventService.listForCase(
      caseId,
      cursor.sequence,
      limit + 1,
    );
    const hasMore = documents.length > limit;
    const items = documents
      .slice(0, limit)
      .map((document) => this.toPublicCaseEvent(document));
    const last = documents[limit - 1];

    return {
      hasMore,
      items,
      nextCursor:
        hasMore && last
          ? encodeEventCursor({ sequence: last.sequence, version: 1 })
          : null,
    };
  }

  async getMutableForSystem(
    caseId: string,
    expectedRevision?: number,
  ): Promise<CaseDocument> {
    const filter: Record<string, unknown> = {
      _id: this.toObjectId(caseId),
      deletedAt: null,
    };
    if (expectedRevision !== undefined) {
      filter.revision = expectedRevision;
    }
    const current = await this.caseModel.findOne(filter).exec();
    if (current) {
      return current;
    }

    const deleted = await this.caseModel
      .findOne({ _id: this.toObjectId(caseId) })
      .select({ deletedAt: 1 })
      .exec();
    if (deleted?.deletedAt) {
      throw new CaseTombstonedError();
    }
    if (expectedRevision !== undefined) {
      throw new StaleCaseRevisionError();
    }
    throw new NotFoundException("Case not found.");
  }

  private async findOwnedCaseWithDecision(
    ownerId: string,
    caseId: string,
    session?: ClientSession,
  ): Promise<CaseWithDecision> {
    const caseDocument = await this.findOwnedCase(ownerId, caseId, session);
    const decision = await this.findDecision(caseId, session);
    return { case: caseDocument, decision };
  }

  private async findOwnedCase(
    ownerId: string,
    caseId: string,
    session?: ClientSession,
  ): Promise<CaseDocument> {
    const query = this.caseModel.findOne(
      this.ownershipAuthorizationService.withOwnerScope(ownerId, {
        _id: this.toObjectId(caseId),
        deletedAt: null,
      }),
    );
    if (session) {
      query.session(session);
    }
    const document = await query.exec();
    if (!document) {
      throw new NotFoundException("Case not found.");
    }
    return document;
  }

  private async findOwnedCaseIncludingDeleted(
    ownerId: string,
    caseId: string,
    session?: ClientSession,
  ): Promise<CaseDocument> {
    const query = this.caseModel.findOne(
      this.ownershipAuthorizationService.withOwnerScope(ownerId, {
        _id: this.toObjectId(caseId),
      }),
    );
    if (session) {
      query.session(session);
    }
    const document = await query.exec();
    if (!document) {
      throw new NotFoundException("Case not found.");
    }
    return document;
  }

  private async findDecision(
    caseId: string,
    session?: ClientSession,
  ): Promise<DecisionDocument> {
    const query = this.decisionModel.findOne({
      caseId: this.toObjectId(caseId),
    });
    if (session) {
      query.session(session);
    }
    const decision = await query.exec();
    if (!decision) {
      throw new Error("Case decision is missing");
    }
    return decision;
  }

  private toPublicCase(
    value: CaseWithDecision | { case: CaseDocument },
  ): PublicCase {
    const decision = "decision" in value ? value.decision : undefined;
    return {
      activeProcedureId: value.case.activeProcedureId?.toString() ?? null,
      activeProcedureVersionId:
        value.case.activeProcedureVersionId?.toString() ?? null,
      caseKey: value.case.caseKey,
      contradictionCount: value.case.contradictionCount,
      createdAt: value.case.createdAt,
      currentStage: value.case.currentStage,
      decisionDate: value.case.decisionDate,
      decisionType: value.case.decisionType,
      deletedAt: value.case.deletedAt,
      financialImpact: toPublicFinancialImpact(value.case.financialImpact),
      graphVersion: value.case.graphVersion,
      id: value.case._id.toString(),
      institutionId: value.case.institutionId?.toString() ?? null,
      institutionNameRaw: value.case.institutionNameRaw,
      jurisdiction: value.case.jurisdiction,
      nextRecommendedActionId:
        value.case.nextRecommendedActionId?.toString() ?? null,
      notificationDate: value.case.notificationDate,
      openCriticalGapCount: value.case.openCriticalGapCount,
      readiness: value.case.readiness,
      relationship: value.case.relationship,
      revision: value.case.revision,
      statedReason: value.case.statedReason,
      status: value.case.status,
      title: value.case.title,
      updatedAt: value.case.updatedAt,
      ...(decision ? { decision: this.toPublicDecision(decision) } : {}),
    };
  }

  private toPublicDecision(decision: DecisionDocument): PublicDecision {
    const rawExtractedFields = toDecisionSnapshot(decision.rawExtractedFields);
    const userCorrectedFields = toDecisionCorrection(
      decision.userCorrectedFields,
    );
    return {
      createdAt: decision.createdAt,
      effectiveFields: applyDecisionCorrection(
        rawExtractedFields,
        userCorrectedFields,
        {},
      ),
      id: decision._id.toString(),
      rawExtractedFields,
      revision: decision.revision,
      updatedAt: decision.updatedAt,
      userCorrectedFields,
    };
  }

  private toPublicCaseEvent(event: CaseEventDocument): PublicCaseEvent {
    return {
      actorId: event.actorId,
      actorType: event.actorType,
      caseId: event.caseId.toString(),
      correlationId: event.correlationId,
      createdAt: event.createdAt,
      id: event._id.toString(),
      payload: event.payload,
      sequence: event.sequence,
      type: event.type,
    };
  }

  private toObjectId(value: string): Types.ObjectId {
    if (!isValidObjectId(value)) {
      throw new NotFoundException("Case not found.");
    }
    return new Types.ObjectId(value);
  }
}

function createCaseKey(): string {
  return `RC-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}
