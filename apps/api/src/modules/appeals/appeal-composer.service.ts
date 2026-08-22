import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { isValidObjectId, Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";
import {
  appealStructuredArgumentsSchema,
  type AppealRequestedOutcome,
} from "@recourse/contracts";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { CaseEventService } from "../cases/case-events.service";
import { CaseStateMachineService } from "../cases/case-state-machine.service";
import { Case } from "../cases/schemas/case.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";
import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
import { Claim } from "../intelligence/schemas/claim.schema";
import { EvidenceRequirementMatch } from "../intelligence/schemas/evidence-requirement-match.schema";
import { Procedure } from "../procedure/schemas/procedure.schema";
import { ProcedureVersion } from "../procedure/schemas/procedure-version.schema";
import { ProceduralClaim } from "../procedure/schemas/procedural-claim.schema";
import { SourceSnapshot } from "../retrieval/schemas/source-snapshot.schema";
import { isInstitutionPublishedPage } from "../retrieval/authority-ranking.service";
import { Appeal, type AppealDocument } from "./schemas/appeal.schema";
import {
  GroundingVerifierService,
  type GroundingClaim,
  type GroundingProceduralClaim,
} from "./grounding-verifier.service";
import { type ActionRecommendation } from "./appeal.types";

export class AppealBlockedError extends ConflictException {
  constructor(code: string, message: string) {
    super({ code, message });
  }
}

@Injectable()
export class AppealComposerService {
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    @InjectModel(Evidence.name) private readonly evidenceModel: Model<Evidence>,
    @InjectModel(EvidenceBlock.name)
    private readonly evidenceBlockModel: Model<EvidenceBlock>,
    @InjectModel(EvidenceRequirementMatch.name)
    private readonly requirementModel: Model<EvidenceRequirementMatch>,
    @InjectModel(Procedure.name)
    private readonly procedureModel: Model<Procedure>,
    @InjectModel(ProcedureVersion.name)
    private readonly procedureVersionModel: Model<ProcedureVersion>,
    @InjectModel(ProceduralClaim.name)
    private readonly proceduralClaimModel: Model<ProceduralClaim>,
    @InjectModel(SourceSnapshot.name)
    private readonly sourceSnapshotModel: Model<SourceSnapshot>,
    @InjectModel(Appeal.name) private readonly appealModel: Model<Appeal>,
    private readonly ownership: OwnershipAuthorizationService,
    private readonly grounding: GroundingVerifierService,
    private readonly events: CaseEventService,
    private readonly stateMachine: CaseStateMachineService,
  ) {}

  async compose(
    ownerId: string,
    caseId: string,
    requestedOutcome: AppealRequestedOutcome,
  ): Promise<AppealDocument> {
    const context = await this.loadContext(ownerId, caseId);
    if (!context.procedure || !context.version) {
      throw new AppealBlockedError(
        "PROCEDURE_UNAVAILABLE",
        "A verified procedure is required before an appeal can be generated.",
      );
    }
    // if (!isProcedureFresh(context.procedure, this.config)) {
    //   throw new AppealBlockedError(
    //     "PROCEDURE_VERSION_EXPIRED",
    //     "The active procedure version is expired and must be refreshed.",
    //   );
    // }
    if (
      context.caseDocument.status !== "READY_TO_APPEAL" &&
      context.caseDocument.status !== "AWAITING_USER_APPROVAL"
    ) {
      throw new AppealBlockedError(
        "CASE_NOT_READY",
        "The case is not in a state where an appeal may be generated.",
      );
    }
    const unresolvedFacts =
      context.caseDocument.analysis?.unresolvedFacts ?? [];
    if (
      unresolvedFacts.some(
        (fact) =>
          typeof fact !== "object" ||
          fact === null ||
          fact.resolutionOwner !== "INSTITUTION",
      )
    ) {
      throw new AppealBlockedError(
        "UNRESOLVED_CASE_FACTS",
        "Complete the blocking case fact work and re-run analysis before generating an appeal.",
      );
    }

    const claims = await this.claimModel
      .find(
        this.ownership.withOwnerScope(ownerId, {
          caseId: context.caseDocument._id,
          resolutionStatus: { $ne: "MERGED" as const },
        }),
      )
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    const verifiedClaims = claims.filter(
      (claim) =>
        (claim.status === "VERIFIED_DOCUMENT" ||
          claim.status === "EXTERNAL_VERIFIED") &&
        claim.sourceRefs.some((ref) => ref.sourceType === "EVIDENCE_BLOCK"),
    );
    if (verifiedClaims.length === 0) {
      throw new AppealBlockedError(
        "NO_VERIFIED_CASE_CLAIMS",
        "No case facts with evidence provenance are available.",
      );
    }

    const blockIds = verifiedClaims.flatMap((claim) =>
      claim.sourceRefs
        .filter((ref) => ref.sourceType === "EVIDENCE_BLOCK")
        .map((ref) => ref.sourceId),
    );
    const blocks = await this.evidenceBlockModel
      .find({
        _id: { $in: blockIds.filter((id) => isValidObjectId(id)) },
        caseId: context.caseDocument._id,
      })
      .select({ _id: 1, evidenceId: 1 })
      .exec();
    const evidenceIds = new Set(
      blocks.map((block) => block.evidenceId.toString()),
    );
    const evidence = await this.evidenceModel
      .find({
        _id: { $in: [...evidenceIds].map((id) => new Types.ObjectId(id)) },
        caseId: context.caseDocument._id,
        deletedAt: null,
        ownerId: new Types.ObjectId(ownerId),
      })
      .select({ _id: 1 })
      .exec();
    const activeEvidenceIds = new Set(
      evidence.map((item) => item._id.toString()),
    );
    const groundedClaims = verifiedClaims.filter((claim) =>
      claim.sourceRefs.some(
        (ref) =>
          ref.sourceType === "EVIDENCE_BLOCK" &&
          blocks.some(
            (block) =>
              block._id.toString() === ref.sourceId &&
              activeEvidenceIds.has(block.evidenceId.toString()),
          ),
      ),
    );

    const proceduralClaims = await this.proceduralClaimModel
      .find({
        procedureVersionId: context.version._id,
        verificationStatus: "SUPPORTED",
      })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    if (proceduralClaims.length === 0) {
      throw new AppealBlockedError(
        "NO_VERIFIED_PROCEDURAL_CLAIMS",
        "No supported procedural claims are available for this procedure version.",
      );
    }
    const selectedProceduralClaims = proceduralClaims.slice(0, 10);
    const selectedGroundedClaims = selectGroundedClaims(
      groundedClaims,
      Math.max(1, 20 - selectedProceduralClaims.length),
    );

    const structured = appealStructuredArgumentsSchema.parse({
      arguments: [
        ...selectedGroundedClaims.map((claim) => ({
          proposition: `The available case record states: ${safeSentence(claim.text)}`,
          requestedOutcome,
          supportingClaimIds: [claim._id.toString()],
          supportingEvidenceIds: claim.sourceRefs
            .filter((ref) => ref.sourceType === "EVIDENCE_BLOCK")
            .map((ref) => ref.sourceId),
          supportingProceduralClaimIds: [],
        })),
        ...selectedProceduralClaims.map((claim) => ({
          proposition: `The verified procedure states: ${safeSentence(claim.humanText)}`,
          requestedOutcome,
          supportingClaimIds: [],
          supportingEvidenceIds: [],
          supportingProceduralClaimIds: [claim._id.toString()],
        })),
      ],
      conclusion: `I request ${outcomeText(requestedOutcome)} based on the records and verified procedure cited above.`,
      introduction:
        "I respectfully request review of the decision described in this case.",
      requestedOutcome,
    });
    const groundingContext = {
      claims: selectedGroundedClaims.map(toGroundingClaim),
      evidenceIds: new Set(
        blocks
          .filter((block) => activeEvidenceIds.has(block.evidenceId.toString()))
          .map((block) => block._id.toString()),
      ),
      procedureVersionId: context.version._id.toString(),
      proceduralClaims: selectedProceduralClaims.map(
        toGroundingProceduralClaim,
      ),
    };
    const grounding = this.grounding.verify(structured, groundingContext);
    if (grounding.unsupportedAssertionCount > 0) {
      throw new AppealBlockedError(
        "APPEAL_GROUNDING_BLOCKED",
        "The draft contains material assertions without verified provenance.",
      );
    }

    const requirements = await this.requirementModel
      .find({
        caseId: context.caseDocument._id,
        procedureVersionId: context.version._id,
      })
      .sort({ critical: -1, requirementKey: 1 })
      .exec();
    const attachmentChecklist = requirements.map((requirement) => ({
      critical: requirement.critical,
      evidenceIds: requirement.evidenceIds.map((id) => id.toString()),
      requirementId: requirement._id.toString(),
      requirementKey: requirement.requirementKey,
      requirementText: requirement.requirementText,
      status: requirement.status,
    }));
    const attachmentEvidenceIds = [
      ...new Set(
        requirements.flatMap((requirement) =>
          requirement.evidenceIds
            .filter((id) => activeEvidenceIds.has(id.toString()))
            .map((id) => id.toString()),
        ),
      ),
    ].map((id) => new Types.ObjectId(id));
    const latest = await this.appealModel
      .findOne({ caseId: context.caseDocument._id })
      .sort({ sequence: -1, version: -1 })
      .exec();
    const sequence =
      latest &&
      ["DRAFT", "AWAITING_APPROVAL", "BLOCKED"].includes(latest.status)
        ? latest.sequence
        : (latest?.sequence ?? 0) + 1;
    const version =
      latest && sequence === latest.sequence ? latest.version + 1 : 1;
    const renderedBody = renderAppeal(structured);
    const contentHash = createHash("sha256")
      .update(JSON.stringify({ grounding, renderedBody, structured }))
      .digest("hex");
    const appeal = await this.appealModel.create({
      approvedAt: null,
      approvedBy: null,
      attachmentChecklist,
      attachmentEvidenceIds,
      attachmentRequirementIds: requirements
        .filter((requirement) =>
          ["MISSING", "PARTIAL", "UNCERTAIN"].includes(requirement.status),
        )
        .map((requirement) => requirement._id),
      caseId: context.caseDocument._id,
      contentHash,
      factualGroundingCoverage: grounding.factualGroundingCoverage,
      modelRunId: null,
      ownerId: new Types.ObjectId(ownerId),
      procedureVersionId: context.version._id,
      proceduralGroundingCoverage: grounding.proceduralGroundingCoverage,
      renderedBody,
      sequence,
      status: "AWAITING_APPROVAL",
      structuredArguments: structured,
      title: `Challenge of ${context.caseDocument.title}`.slice(0, 300),
      unsupportedAssertionCount: grounding.unsupportedAssertionCount,
      version,
    });
    await this.events.append({
      actor: { actorId: ownerId, actorType: "USER" },
      caseId,
      idempotencyKey: `appeal-generated-${appeal._id.toString()}`,
      payload: {
        appealId: appeal._id.toString(),
        factualGroundingCoverage: appeal.factualGroundingCoverage,
        procedureVersionId: appeal.procedureVersionId.toString(),
        proceduralGroundingCoverage: appeal.proceduralGroundingCoverage,
      },
      type: "APPEAL_GENERATED",
    });
    if (context.caseDocument.status === "READY_TO_APPEAL") {
      await this.stateMachine.transition(
        caseId,
        "AWAITING_USER_APPROVAL",
        { actorId: ownerId, actorType: "USER" },
        {
          expectedCurrent: ["READY_TO_APPEAL"],
          expectedRevision: context.caseDocument.revision,
          idempotencyKey: `appeal-awaiting-approval-${appeal._id.toString()}`,
          payload: { appealId: appeal._id.toString() },
        },
      );
    }
    return appeal;
  }

  private async loadContext(
    ownerId: string,
    caseId: string,
  ): Promise<{
    caseDocument: import("../cases/schemas/case.schema").CaseDocument;
    procedure:
      import("../procedure/schemas/procedure.schema").ProcedureDocument | null;
    version:
      | import("../procedure/schemas/procedure-version.schema").ProcedureVersionDocument
      | null;
  }> {
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
    const procedure = caseDocument.activeProcedureId
      ? await this.procedureModel
          .findById(caseDocument.activeProcedureId)
          .exec()
      : null;
    const version = caseDocument.activeProcedureVersionId
      ? await this.procedureVersionModel
          .findById(caseDocument.activeProcedureVersionId)
          .exec()
      : null;
    return { caseDocument, procedure, version };
  }

  async recommendation(appeal: AppealDocument): Promise<ActionRecommendation> {
    const version = await this.procedureVersionModel
      .findById(appeal.procedureVersionId)
      .exec();
    if (!version) throw new NotFoundException("Procedure version not found.");
    const procedure = await this.procedureModel
      .findById(version.procedureId)
      .exec();
    if (!procedure) throw new NotFoundException("Procedure not found.");
    const sources = await this.sourceSnapshotModel
      .find({ _id: { $in: version.sourceSnapshotIds } })
      .sort({ authorityTier: 1, retrievedAt: -1 })
      .exec();
    const official = sources
      .filter(
        (source) =>
          [
            "TIER_1_OFFICIAL_INSTITUTION",
            "TIER_1_OFFICIAL_GOVERNMENT",
            "TIER_1_REGULATOR_ADR",
          ].includes(source.authorityTier) &&
          isInstitutionPublishedPage(source.canonicalUrl),
      )
      .sort(
        (left, right) =>
          submissionDestinationScore(right) -
            submissionDestinationScore(left) ||
          left.canonicalUrl.localeCompare(right.canonicalUrl),
      )[0];
    const instructions = version.steps
      .map((step) => readObjectText(step, "description"))
      .filter((value): value is string => Boolean(value));
    const officialDestination = official?.canonicalUrl ?? null;
    const capability =
      procedure.status === "ACTIVE"
        ? version.submissionCapability
        : "UNSUPPORTED";
    return {
      actionType: "SUBMIT_APPEAL",
      available:
        (capability === "ASSISTED_PORTAL" || capability === "MANUAL") &&
        instructions.length > 0,
      canExecute: false,
      capability,
      gates: [],
      instructions,
      officialDestination,
      reason:
        capability === "ASSISTED_PORTAL"
          ? "A verified official destination is available; the user must complete the portal submission."
          : "The currently verified procedure does not expose a configured executable submission adapter.",
      requiresApproval: true,
      supportingClaimIds: [],
      supportingEvidenceIds: appeal.attachmentEvidenceIds.map((id) =>
        id.toString(),
      ),
      supportingProceduralClaimIds: version.proceduralClaimIds.map((id) =>
        id.toString(),
      ),
      supportingSourceSnapshotIds: version.sourceSnapshotIds.map((id) =>
        id.toString(),
      ),
    };
  }
}

function toGroundingClaim(claim: {
  _id: Types.ObjectId;
  sourceRefs: Array<{ sourceType: string; sourceId: string }>;
  status: import("@recourse/contracts").ClaimEvidenceStatus;
  text: string;
}): GroundingClaim {
  return {
    id: claim._id.toString(),
    sourceRefs: claim.sourceRefs,
    status: claim.status,
    text: claim.text,
  };
}

function toGroundingProceduralClaim(
  claim: import("../procedure/schemas/procedural-claim.schema").ProceduralClaimDocument,
): GroundingProceduralClaim {
  return {
    humanText: claim.humanText,
    id: claim._id.toString(),
    procedureVersionId: claim.procedureVersionId.toString(),
    support: claim.support.map((support) => ({
      paragraphIds: support.paragraphIds,
      sourceSnapshotId: support.sourceSnapshotId.toString(),
    })),
    verificationStatus: claim.verificationStatus,
  };
}

function renderAppeal(
  structured: import("@recourse/contracts").AppealStructuredArguments,
): string {
  return [
    structured.introduction,
    ...structured.arguments.map((argument) => argument.proposition),
    structured.conclusion,
  ].join("\n\n");
}

function safeSentence(value: string): string {
  return value
    .replace(/[\r\n]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function outcomeText(value: AppealRequestedOutcome): string {
  return value.toLowerCase().replaceAll("_", " ");
}

type SelectableGroundedClaim = {
  _id: Types.ObjectId;
  confidence: number;
  normalizedText: string;
  sourceRefs: Array<{ sourceType: string; sourceId: string }>;
  text: string;
};

/**
 * Keep the appeal contract bounded while favouring strong, non-repetitive facts.
 * Extraction can legitimately produce more claims than a single appeal should
 * enumerate, especially when several evidence blocks restate the same event.
 */
export function selectGroundedClaims<T extends SelectableGroundedClaim>(
  claims: T[],
  limit: number,
): T[] {
  if (limit <= 0) return [];

  const ranked = [...claims].sort(
    (left, right) =>
      right.confidence - left.confidence ||
      left.text.length - right.text.length ||
      left._id.toString().localeCompare(right._id.toString()),
  );
  const selected: T[] = [];
  const selectedTokens: Set<string>[] = [];
  const seenNormalized = new Set<string>();

  for (const claim of ranked) {
    const normalized = normalizeForSelection(
      claim.normalizedText || claim.text,
    );
    if (!normalized || seenNormalized.has(normalized)) continue;

    const tokens = new Set(normalized.split(" ").filter(Boolean));
    const substantiallyDuplicates = selectedTokens.some(
      (existing) => tokenSimilarity(tokens, existing) >= 0.82,
    );
    if (substantiallyDuplicates) continue;

    selected.push(claim);
    selectedTokens.push(tokens);
    seenNormalized.add(normalized);
    if (selected.length === limit) break;
  }

  // Similar claims can still be materially distinct. Fill any remaining slots
  // from the deterministic ranking after exact duplicates have been removed.
  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((claim) => claim._id.toString()));
    for (const claim of ranked) {
      const normalized = normalizeForSelection(
        claim.normalizedText || claim.text,
      );
      if (
        !normalized ||
        seenNormalized.has(normalized) ||
        selectedIds.has(claim._id.toString())
      ) {
        continue;
      }
      selected.push(claim);
      selectedIds.add(claim._id.toString());
      seenNormalized.add(normalized);
      if (selected.length === limit) break;
    }
  }

  return selected;
}

function normalizeForSelection(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / Math.min(left.size, right.size);
}

export function isProcedureFresh(
  procedure: import("../procedure/schemas/procedure.schema").ProcedureDocument,
  config: ConfigService<EnvironmentConfig>,
  now = Date.now(),
): boolean {
  return Boolean(
    procedure.status === "ACTIVE" &&
    procedure.lastVerifiedAt &&
    now - procedure.lastVerifiedAt.getTime() <=
      (config.get("PROCEDURE_STALE_AFTER_HOURS") ?? 168) * 3_600_000,
  );
}

function readObjectText(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const text = value[key];
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function submissionDestinationScore(source: {
  canonicalUrl: string;
  paragraphs: Array<{ text: string }>;
}): number {
  const url = source.canonicalUrl.toLowerCase();
  const text = source.paragraphs
    .slice(0, 20)
    .map((paragraph) => paragraph.text)
    .join(" ")
    .toLowerCase();
  let score = 0;
  if (/\/(?:answer|contact|appeal)(?:\/|\?|$)/u.test(url)) score += 30;
  if (/\b(?:submit|start) (?:an? )?appeal\b/u.test(text)) score += 20;
  if (/\bofficial (?:appeal )?form\b/u.test(text)) score += 15;
  if (/\bappeal\b/u.test(url)) score += 10;
  if (/\bappeal\b/u.test(text)) score += 5;
  if (/\b(?:policy|policies)\b/u.test(url)) score -= 5;
  return score;
}
