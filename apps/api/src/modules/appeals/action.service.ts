import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { isValidObjectId, Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";
import {
  type ControlledActionType,
  type SubmissionCapability,
} from "@recourse/contracts";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import {
  AuditEventType,
  AuditOutcome,
} from "../audit/schemas/audit-log.schema";
import { AuditLogService } from "../audit/audit.service";
import { CaseEventService } from "../cases/case-events.service";
import { Case } from "../cases/schemas/case.schema";
import { Contradiction } from "../intelligence/schemas/contradiction.schema";
import { EvidenceRequirementMatch } from "../intelligence/schemas/evidence-requirement-match.schema";
import { Procedure } from "../procedure/schemas/procedure.schema";
import { ProcedureVersion } from "../procedure/schemas/procedure-version.schema";
import { ProceduralClaim } from "../procedure/schemas/procedural-claim.schema";
import { CaseStateMachineService } from "../cases/case-state-machine.service";
import {
  AppealComposerService,
  isProcedureFresh,
} from "./appeal-composer.service";
import { ActionPolicyEngine } from "./action-policy.service";
import { AssistedPortalAdapter } from "./adapters/assisted-portal.adapter";
import { EmailActionAdapter } from "./adapters/email.adapter";
import {
  type ActionAdapter,
  type ActionRecommendation,
  type PreparedAction,
} from "./appeal.types";
import { Appeal } from "./schemas/appeal.schema";
import {
  CaseAction,
  type CaseActionDocument,
} from "./schemas/case-action.schema";

export interface CreateActionInput {
  actionType: ControlledActionType;
  capability?: SubmissionCapability;
  idempotencyKey: string;
}

@Injectable()
export class ActionService {
  private readonly adapters: readonly ActionAdapter[];

  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Appeal.name) private readonly appealModel: Model<Appeal>,
    @InjectModel(CaseAction.name)
    private readonly actionModel: Model<CaseAction>,
    @InjectModel(Procedure.name)
    private readonly procedureModel: Model<Procedure>,
    @InjectModel(ProcedureVersion.name)
    private readonly procedureVersionModel: Model<ProcedureVersion>,
    @InjectModel(ProceduralClaim.name)
    private readonly proceduralClaimModel: Model<ProceduralClaim>,
    @InjectModel(EvidenceRequirementMatch.name)
    private readonly requirementModel: Model<EvidenceRequirementMatch>,
    @InjectModel(Contradiction.name)
    private readonly contradictionModel: Model<Contradiction>,
    private readonly ownership: OwnershipAuthorizationService,
    private readonly composer: AppealComposerService,
    private readonly policy: ActionPolicyEngine,
    private readonly events: CaseEventService,
    private readonly audit: AuditLogService,
    private readonly stateMachine: CaseStateMachineService,
    private readonly assistedPortal: AssistedPortalAdapter,
    private readonly email: EmailActionAdapter,
  ) {
    this.adapters = [assistedPortal, email];
  }

  async create(
    ownerId: string,
    caseId: string,
    appealId: string,
    input: CreateActionInput,
  ): Promise<CaseActionDocument> {
    const existing = await this.findOwnedActionByIdempotency(
      ownerId,
      caseId,
      input.idempotencyKey,
    );
    if (existing) return existing;
    const context = await this.loadOwnedContext(ownerId, caseId, appealId);
    const recommendation = await this.composer.recommendation(context.appeal);
    const supportingClaimIds = uniqueStrings(
      context.appeal.structuredArguments.arguments.flatMap(
        (argument) => argument.supportingClaimIds,
      ),
    );
    const supportingEvidenceIds = uniqueStrings(
      context.appeal.structuredArguments.arguments.flatMap(
        (argument) => argument.supportingEvidenceIds,
      ),
    );
    const supportingProceduralClaimIds = uniqueStrings(
      context.appeal.structuredArguments.arguments.flatMap(
        (argument) => argument.supportingProceduralClaimIds,
      ),
    );
    const enrichedRecommendation: ActionRecommendation = {
      ...recommendation,
      actionType: input.actionType,
      supportingClaimIds,
      supportingEvidenceIds,
      supportingProceduralClaimIds,
      supportingSourceSnapshotIds: recommendation.supportingSourceSnapshotIds,
    };
    if (
      input.capability &&
      input.capability !== enrichedRecommendation.capability
    ) {
      throw new BadRequestException(
        "Requested capability does not match the verified procedure.",
      );
    }
    const procedure = await this.procedureModel
      .findById(context.version.procedureId)
      .exec();
    if (!procedure) throw new NotFoundException("Procedure not found.");
    const requirements = await this.requirementModel
      .find({
        caseId: context.case._id,
        procedureVersionId: context.version._id,
      })
      .exec();
    const contradictions = await this.contradictionModel
      .find({ caseId: context.case._id, status: { $in: ["OPEN", "UNKNOWN"] } })
      .select({ _id: 1 })
      .limit(1)
      .exec();
    const decision = this.policy.evaluate({
      actionType: input.actionType,
      appealStatus: context.appeal.status,
      capability: enrichedRecommendation.capability,
      caseStatus: context.case.status,
      criticalRequirementGap: requirements.some(
        (requirement) =>
          requirement.critical &&
          ["MISSING", "PARTIAL", "UNCERTAIN"].includes(requirement.status),
      ),
      deletedAt: context.case.deletedAt,
      factualGroundingCoverage: context.appeal.factualGroundingCoverage,
      instructions: enrichedRecommendation.instructions,
      officialDestination: enrichedRecommendation.officialDestination,
      procedureStatus: procedure.status,
      procedureVersionFresh: isProcedureFresh(procedure, this.config),
      procedureVersionMatchesCase:
        context.case.activeProcedureVersionId?.equals(context.version._id) ??
        false,
      proceduralGroundingCoverage: context.appeal.proceduralGroundingCoverage,
      supportingClaimIds,
      supportingEvidenceIds,
      supportingProceduralClaimIds,
      supportingSourceSnapshotIds:
        enrichedRecommendation.supportingSourceSnapshotIds,
      unresolvedContradiction: contradictions.length > 0,
      unsupportedAssertionCount: context.appeal.unsupportedAssertionCount,
    });
    const blockingGates = decision.recommendation.gates.filter(
      (gate) => gate !== "USER_APPROVAL_REQUIRED",
    );
    const status =
      decision.recommendation.available && blockingGates.length === 0
        ? "AWAITING_APPROVAL"
        : "UNAVAILABLE";
    const action = await this.actionModel.create({
      actionType: input.actionType,
      adapterName:
        this.findAdapter(enrichedRecommendation.capability)?.name ?? null,
      appealId: context.appeal._id,
      approvedAt: null,
      approvedBy: null,
      caseId: context.case._id,
      capability: enrichedRecommendation.capability,
      executionAttempts: 0,
      failureCode: blockingGates[0] ?? null,
      failureMessage:
        blockingGates.length > 0 ? decision.recommendation.reason : null,
      idempotencyKey: input.idempotencyKey,
      ownerId: new Types.ObjectId(ownerId),
      payloadHash: digest({
        appealId: context.appeal._id.toString(),
        capability: enrichedRecommendation.capability,
        recommendation: enrichedRecommendation,
      }),
      recommendation: {
        ...enrichedRecommendation,
        gates: decision.recommendation.gates,
        reason: decision.recommendation.reason,
      },
      status,
      verificationStatus: "PENDING",
      requiresApproval: true,
      preparedPayload: null,
      externalReference: null,
    });
    await this.caseModel
      .updateOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: context.case._id,
          deletedAt: null,
        }),
        { $set: { nextRecommendedActionId: action._id } },
      )
      .exec();
    await this.events.append({
      actor: { actorId: ownerId, actorType: "USER" },
      caseId,
      idempotencyKey: `action-proposed-${action._id.toString()}`,
      payload: {
        actionId: action._id.toString(),
        capability: action.capability,
        gates: decision.recommendation.gates,
      },
      type: "ACTION_AWAITING_APPROVAL",
    });
    await this.audit.record(
      AuditEventType.ACTION_PROPOSED,
      { userId: ownerId },
      AuditOutcome.SUCCESS,
      { actionId: action._id.toString(), capability: action.capability },
    );
    return action;
  }

  async approve(
    ownerId: string,
    caseId: string,
    actionId: string,
  ): Promise<CaseActionDocument> {
    const context = await this.loadOwnedAction(ownerId, caseId, actionId);
    if (
      context.action.status === "APPROVED" ||
      context.action.status === "PREPARED"
    ) {
      const currentPolicy = await this.evaluateCurrentPolicy(context);
      if (!currentPolicy.allowed) {
        await this.invalidateAction(context.action, currentPolicy);
        throw new ConflictException(
          "The approved action no longer passes the safety policy.",
        );
      }
      return context.action;
    }
    if (context.action.status !== "AWAITING_APPROVAL") {
      throw new ConflictException("This action is not awaiting approval.");
    }
    const blockingGates = readRecommendationGates(context.action).filter(
      (gate) => gate !== "USER_APPROVAL_REQUIRED",
    );
    if (blockingGates.length > 0) {
      throw new ConflictException(
        "The action is blocked by current safety gates.",
      );
    }
    if (
      !context.appeal ||
      !["AWAITING_APPROVAL", "APPROVED"].includes(context.appeal.status)
    ) {
      throw new ConflictException("The appeal is not awaiting approval.");
    }
    const approvalPolicy = await this.evaluateCurrentPolicy(
      context,
      "APPROVED",
    );
    if (!approvalPolicy.allowed) {
      throw new ConflictException(
        "The action is blocked by current safety gates.",
      );
    }
    if (context.appeal.status === "AWAITING_APPROVAL") {
      context.appeal.status = "APPROVED";
      context.appeal.approvedAt = new Date();
      context.appeal.approvedBy = new Types.ObjectId(ownerId);
      await context.appeal.save();
    }
    context.action.status = "APPROVED";
    context.action.recommendation = {
      ...context.action.recommendation,
      gates: [],
    };
    context.action.approvedAt = new Date();
    context.action.approvedBy = new Types.ObjectId(ownerId);
    await context.action.save();
    await this.events.append({
      actor: { actorId: ownerId, actorType: "USER" },
      caseId,
      idempotencyKey: `action-approved-${context.action._id.toString()}`,
      payload: { actionId: context.action._id.toString() },
      type: "ACTION_AWAITING_APPROVAL",
    });
    await this.audit.record(
      AuditEventType.ACTION_APPROVED,
      { userId: ownerId },
      AuditOutcome.SUCCESS,
      { actionId: context.action._id.toString() },
    );
    return context.action;
  }

  async execute(
    ownerId: string,
    caseId: string,
    actionId: string,
  ): Promise<CaseActionDocument> {
    const context = await this.loadOwnedAction(ownerId, caseId, actionId);
    const action = context.action;
    if (
      ["SUCCEEDED", "EXECUTING", "VERIFICATION_FAILED"].includes(action.status)
    ) {
      return action;
    }
    if (action.status === "PREPARED") {
      const currentPolicy = await this.evaluateCurrentPolicy(context);
      if (!currentPolicy.allowed) {
        await this.invalidateAction(action, currentPolicy);
        throw new ConflictException(
          "The prepared action no longer passes the safety policy.",
        );
      }
      return action;
    }
    if (action.status !== "APPROVED") {
      throw new ConflictException(
        "Action requires explicit user approval before execution.",
      );
    }
    const currentPolicy = await this.evaluateCurrentPolicy(context);
    if (!currentPolicy.allowed) {
      action.status = "UNAVAILABLE";
      action.failureCode =
        currentPolicy.recommendation.gates[0] ?? "POLICY_BLOCKED";
      action.failureMessage = currentPolicy.recommendation.reason;
      await action.save();
      throw new ConflictException(
        "The action no longer passes the safety policy.",
      );
    }
    const adapter = this.findAdapter(action.capability);
    if (!adapter) {
      action.status = "UNAVAILABLE";
      action.failureCode = "ADAPTER_UNAVAILABLE";
      action.failureMessage =
        "No real adapter is configured for this capability.";
      await action.save();
      throw new ServiceUnavailableException(action.failureMessage);
    }
    action.status = "PREPARING";
    action.executionAttempts += 1;
    await action.save();
    let prepared: PreparedAction;
    try {
      prepared = await adapter.prepare(action);
    } catch (error: unknown) {
      action.status = "UNAVAILABLE";
      action.failureCode = "ADAPTER_PREPARATION_FAILED";
      action.failureMessage =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Action preparation failed.";
      await action.save();
      throw error;
    }
    action.preparedPayload = {
      destination: prepared.destination,
      instructions: prepared.instructions,
      payload: prepared.payload,
    };
    action.status = "PREPARED";
    await action.save();
    await this.audit.record(
      AuditEventType.ACTION_PREPARED,
      { userId: ownerId },
      AuditOutcome.SUCCESS,
      { actionId: action._id.toString(), capability: action.capability },
    );
    if (!prepared.canExecute) {
      return action;
    }
    action.status = "EXECUTING";
    await action.save();
    const result = await adapter.execute(prepared, action.idempotencyKey);
    const verification = await adapter.verify(result);
    action.externalReference = verification.providerReference;
    action.verificationStatus = verification.verified ? "VERIFIED" : "FAILED";
    action.status = verification.verified ? "SUCCEEDED" : "VERIFICATION_FAILED";
    action.failureCode = verification.verified ? null : "VERIFICATION_FAILED";
    action.failureMessage = verification.verified
      ? null
      : verification.explanation;
    await action.save();
    await this.audit.record(
      verification.verified
        ? AuditEventType.ACTION_EXECUTED
        : AuditEventType.ACTION_VERIFICATION_FAILED,
      { userId: ownerId },
      verification.verified ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
      { actionId: action._id.toString() },
    );
    if (verification.verified) {
      await this.events.append({
        actor: { actorId: null, actorType: "SYSTEM" },
        caseId,
        idempotencyKey: `action-completed-${action._id.toString()}`,
        payload: { actionId: action._id.toString() },
        type: "ACTION_COMPLETED",
      });
    } else {
      await this.events.append({
        actor: { actorId: null, actorType: "SYSTEM" },
        caseId,
        idempotencyKey: `action-verification-failed-${action._id.toString()}`,
        payload: { actionId: action._id.toString() },
        type: "ACTION_VERIFICATION_FAILED",
      });
    }
    if (
      verification.verified &&
      context.case.status === "AWAITING_USER_APPROVAL"
    ) {
      await this.stateMachine.transition(
        caseId,
        "SUBMITTED",
        { actorId: null, actorType: "SYSTEM" },
        {
          expectedCurrent: ["AWAITING_USER_APPROVAL"],
          idempotencyKey: `action-submitted-${action._id.toString()}`,
          payload: { actionId: action._id.toString() },
        },
      );
    }
    return action;
  }

  async cancel(
    ownerId: string,
    caseId: string,
    actionId: string,
  ): Promise<CaseActionDocument> {
    const { action } = await this.loadOwnedAction(ownerId, caseId, actionId);
    if (["SUCCEEDED", "EXECUTING"].includes(action.status)) {
      throw new ConflictException(
        "An executing or completed action cannot be cancelled.",
      );
    }
    if (action.status === "CANCELLED") return action;
    action.status = "CANCELLED";
    action.failureCode = "CANCELLED_BY_USER";
    action.failureMessage = "Cancelled by the owner.";
    await action.save();
    await this.audit.record(
      AuditEventType.ACTION_CANCELLED,
      { userId: ownerId },
      AuditOutcome.SUCCESS,
      { actionId: action._id.toString() },
    );
    return action;
  }

  async listAppeals(ownerId: string, caseId: string): Promise<Appeal[]> {
    await this.loadOwnedCase(ownerId, caseId);
    return this.appealModel
      .find(
        this.ownership.withOwnerScope(ownerId, {
          caseId: new Types.ObjectId(caseId),
        }),
      )
      .sort({ sequence: -1, version: -1 })
      .exec();
  }

  async getAppeal(
    ownerId: string,
    caseId: string,
    appealId: string,
  ): Promise<Appeal> {
    await this.loadOwnedCase(ownerId, caseId);
    const appeal = await this.appealModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: toObjectId(appealId),
          caseId: toObjectId(caseId),
        }),
      )
      .exec();
    if (!appeal) throw new NotFoundException("Appeal not found.");
    return appeal;
  }

  private async loadOwnedContext(
    ownerId: string,
    caseId: string,
    appealId: string,
  ): Promise<{
    case: import("../cases/schemas/case.schema").CaseDocument;
    appeal: import("./schemas/appeal.schema").AppealDocument;
    version: import("../procedure/schemas/procedure-version.schema").ProcedureVersionDocument;
  }> {
    const caseDocument = await this.loadOwnedCase(ownerId, caseId);
    const appeal = await this.appealModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: toObjectId(appealId),
          caseId: caseDocument._id,
        }),
      )
      .exec();
    if (!appeal) throw new NotFoundException("Appeal not found.");
    const version = await this.procedureVersionModel
      .findById(appeal.procedureVersionId)
      .exec();
    if (!version) throw new NotFoundException("Procedure version not found.");
    return { appeal, case: caseDocument, version };
  }

  private async loadOwnedAction(
    ownerId: string,
    caseId: string,
    actionId: string,
  ): Promise<{
    action: CaseActionDocument;
    appeal: import("./schemas/appeal.schema").AppealDocument | null;
    case: import("../cases/schemas/case.schema").CaseDocument;
  }> {
    const caseDocument = await this.loadOwnedCase(ownerId, caseId);
    const action = await this.actionModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: toObjectId(actionId),
          caseId: caseDocument._id,
        }),
      )
      .exec();
    if (!action) throw new NotFoundException("Action not found.");
    const appeal = action.appealId
      ? await this.appealModel
          .findOne({
            _id: action.appealId,
            ownerId: new Types.ObjectId(ownerId),
            caseId: caseDocument._id,
          })
          .exec()
      : null;
    return { action, appeal, case: caseDocument };
  }

  private async loadOwnedCase(
    ownerId: string,
    caseId: string,
  ): Promise<import("../cases/schemas/case.schema").CaseDocument> {
    if (!isValidObjectId(caseId))
      throw new NotFoundException("Case not found.");
    const caseDocument = await this.caseModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: new Types.ObjectId(caseId),
          deletedAt: null,
        }),
      )
      .exec();
    if (!caseDocument) throw new NotFoundException("Case not found.");
    return caseDocument;
  }

  private async findOwnedActionByIdempotency(
    ownerId: string,
    caseId: string,
    key: string,
  ): Promise<CaseActionDocument | null> {
    if (!isValidObjectId(caseId))
      throw new NotFoundException("Case not found.");
    return this.actionModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          caseId: new Types.ObjectId(caseId),
          idempotencyKey: key,
        }),
      )
      .exec();
  }

  private findAdapter(capability: SubmissionCapability): ActionAdapter | null {
    return (
      this.adapters.find((adapter) => adapter.capability() === capability) ??
      null
    );
  }

  private async invalidateAction(
    action: CaseActionDocument,
    decision: ReturnType<ActionPolicyEngine["evaluate"]>,
  ): Promise<void> {
    action.status = "UNAVAILABLE";
    action.failureCode =
      decision.recommendation.gates[0] ?? "CURRENT_POLICY_BLOCKED";
    action.failureMessage = decision.recommendation.reason;
    await action.save();
  }

  private async evaluateCurrentPolicy(
    context: {
      action: CaseActionDocument;
      appeal: import("./schemas/appeal.schema").AppealDocument | null;
      case: import("../cases/schemas/case.schema").CaseDocument;
    },
    appealStatusOverride?: "APPROVED",
  ): Promise<ReturnType<ActionPolicyEngine["evaluate"]>> {
    if (!context.appeal) {
      return this.policy.evaluate({
        actionType: context.action.actionType,
        appealStatus: appealStatusOverride ?? null,
        capability: context.action.capability,
        caseStatus: context.case.status,
        criticalRequirementGap: true,
        deletedAt: context.case.deletedAt,
        factualGroundingCoverage: 0,
        instructions: [],
        officialDestination: null,
        procedureStatus: null,
        procedureVersionFresh: false,
        procedureVersionMatchesCase: false,
        proceduralGroundingCoverage: 0,
        supportingClaimIds: [],
        supportingEvidenceIds: [],
        supportingProceduralClaimIds: [],
        supportingSourceSnapshotIds: [],
        unresolvedContradiction: true,
        unsupportedAssertionCount: 1,
      });
    }
    const version = await this.procedureVersionModel
      .findById(context.appeal.procedureVersionId)
      .exec();
    const procedure = version
      ? await this.procedureModel.findById(version.procedureId).exec()
      : null;
    const requirements = version
      ? await this.requirementModel
          .find({ caseId: context.case._id, procedureVersionId: version._id })
          .exec()
      : [];
    const contradictions = await this.contradictionModel
      .find({ caseId: context.case._id, status: { $in: ["OPEN", "UNKNOWN"] } })
      .select({ _id: 1 })
      .limit(1)
      .exec();
    const recommendation = context.action.recommendation;
    const supportingProceduralClaimIds = readRecommendationStrings(
      recommendation,
      "supportingProceduralClaimIds",
    );
    const validProceduralClaimCount = version
      ? await this.proceduralClaimModel.countDocuments({
          _id: {
            $in: supportingProceduralClaimIds
              .filter((id) => isValidObjectId(id))
              .map((id) => new Types.ObjectId(id)),
          },
          authorityTier: { $regex: /^TIER_1_/u },
          procedureVersionId: version._id,
          verificationStatus: "SUPPORTED",
        })
      : 0;
    const proceduralClaimsRemainValid =
      supportingProceduralClaimIds.length > 0 &&
      validProceduralClaimCount === supportingProceduralClaimIds.length;
    return this.policy.evaluate({
      actionType: context.action.actionType,
      appealStatus: appealStatusOverride ?? context.appeal.status,
      capability: context.action.capability,
      caseStatus: context.case.status,
      criticalRequirementGap: requirements.some(
        (requirement) =>
          requirement.critical &&
          ["MISSING", "PARTIAL", "UNCERTAIN"].includes(requirement.status),
      ),
      deletedAt: context.case.deletedAt,
      factualGroundingCoverage: context.appeal.factualGroundingCoverage,
      instructions: readRecommendationStrings(recommendation, "instructions"),
      officialDestination: readRecommendationString(
        recommendation,
        "officialDestination",
      ),
      procedureStatus: procedure?.status ?? null,
      procedureVersionFresh: procedure
        ? isProcedureFresh(procedure, this.config)
        : false,
      procedureVersionMatchesCase:
        Boolean(version) &&
        (context.case.activeProcedureVersionId?.equals(version?._id) ?? false),
      proceduralGroundingCoverage: proceduralClaimsRemainValid
        ? context.appeal.proceduralGroundingCoverage
        : 0,
      supportingClaimIds: readRecommendationStrings(
        recommendation,
        "supportingClaimIds",
      ),
      supportingEvidenceIds: readRecommendationStrings(
        recommendation,
        "supportingEvidenceIds",
      ),
      supportingProceduralClaimIds,
      supportingSourceSnapshotIds: readRecommendationStrings(
        recommendation,
        "supportingSourceSnapshotIds",
      ),
      unresolvedContradiction: contradictions.length > 0,
      unsupportedAssertionCount: context.appeal.unsupportedAssertionCount,
    });
  }
}

export function isIdempotentApprovalStatus(status: string): boolean {
  return status === "APPROVED" || status === "PREPARED";
}

export function isIdempotentExecutionStatus(status: string): boolean {
  return ["SUCCEEDED", "EXECUTING", "PREPARED", "VERIFICATION_FAILED"].includes(
    status,
  );
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function toObjectId(value: string): Types.ObjectId {
  if (!isValidObjectId(value))
    throw new NotFoundException("Resource not found.");
  return new Types.ObjectId(value);
}

function readRecommendationGates(action: CaseActionDocument): string[] {
  const gates = action.recommendation["gates"];
  return Array.isArray(gates)
    ? gates.filter((gate): gate is string => typeof gate === "string")
    : [];
}

function readRecommendationString(
  recommendation: Record<string, unknown>,
  key: string,
): string | null {
  const value = recommendation[key];
  return typeof value === "string" ? value : null;
}

function readRecommendationStrings(
  recommendation: Record<string, unknown>,
  key: string,
): string[] {
  const value = recommendation[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
