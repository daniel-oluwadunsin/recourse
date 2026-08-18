import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";

import { type GraphEdgeType, type GraphNodeType } from "@recourse/contracts";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { Case } from "../cases/schemas/case.schema";
import { Evidence } from "../evidence/schemas/evidence.schema";
import { EvidenceBlock } from "../evidence/schemas/evidence-block.schema";
import { Procedure } from "../procedure/schemas/procedure.schema";
import { ProcedureVersion } from "../procedure/schemas/procedure-version.schema";
import { ProceduralClaim } from "../procedure/schemas/procedural-claim.schema";
import { Claim } from "./schemas/claim.schema";
import { Contradiction } from "./schemas/contradiction.schema";
import { EvidenceRequirementMatch } from "./schemas/evidence-requirement-match.schema";
import { GraphEdge, type GraphEdgeDocument } from "./schemas/graph-edge.schema";
import { GraphNode, type GraphNodeDocument } from "./schemas/graph-node.schema";
import { TimelineEvent } from "./schemas/timeline-event.schema";

interface NodeDefinition {
  nodeType: GraphNodeType;
  refType: string;
  refId: string;
  label: string;
  metadata: Record<string, unknown>;
}

interface EdgeDefinition {
  from: string;
  to: string;
  edgeType: GraphEdgeType;
  confidence: number;
  sourceRefs: string[];
}

@Injectable()
export class GraphService {
  constructor(
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Evidence.name) private readonly evidenceModel: Model<Evidence>,
    @InjectModel(EvidenceBlock.name)
    private readonly evidenceBlockModel: Model<EvidenceBlock>,
    @InjectModel(Claim.name) private readonly claimModel: Model<Claim>,
    @InjectModel(TimelineEvent.name)
    private readonly timelineModel: Model<TimelineEvent>,
    @InjectModel(Contradiction.name)
    private readonly contradictionModel: Model<Contradiction>,
    @InjectModel(EvidenceRequirementMatch.name)
    private readonly requirementModel: Model<EvidenceRequirementMatch>,
    @InjectModel(Procedure.name)
    private readonly procedureModel: Model<Procedure>,
    @InjectModel(ProcedureVersion.name)
    private readonly procedureVersionModel: Model<ProcedureVersion>,
    @InjectModel(ProceduralClaim.name)
    private readonly proceduralClaimModel: Model<ProceduralClaim>,
    @InjectModel(GraphNode.name) private readonly nodeModel: Model<GraphNode>,
    @InjectModel(GraphEdge.name) private readonly edgeModel: Model<GraphEdge>,
    private readonly ownership: OwnershipAuthorizationService,
  ) {}

  async rebuild(caseId: string): Promise<{
    version: number;
    nodes: GraphNodeDocument[];
    edges: GraphEdgeDocument[];
  }> {
    const caseDocument = await this.activeCase(caseId);
    const [evidence, blocks, claims, timeline, contradictions, requirements] =
      await Promise.all([
        this.evidenceModel
          .find({ caseId: caseDocument._id, deletedAt: null })
          .exec(),
        this.evidenceBlockModel.find({ caseId: caseDocument._id }).exec(),
        this.claimModel
          .find({
            caseId: caseDocument._id,
            resolutionStatus: { $ne: "MERGED" },
          })
          .exec(),
        this.timelineModel.find({ caseId: caseDocument._id }).exec(),
        this.contradictionModel.find({ caseId: caseDocument._id }).exec(),
        this.requirementModel.find({ caseId: caseDocument._id }).exec(),
      ]);
    const procedure = caseDocument.activeProcedureId
      ? await this.procedureModel
          .findById(caseDocument.activeProcedureId)
          .exec()
      : null;
    const procedureVersion = caseDocument.activeProcedureVersionId
      ? await this.procedureVersionModel
          .findById(caseDocument.activeProcedureVersionId)
          .exec()
      : null;
    const proceduralClaims = procedureVersion
      ? await this.proceduralClaimModel
          .find({ _id: { $in: procedureVersion.proceduralClaimIds } })
          .exec()
      : [];
    const version = Math.max(1, caseDocument.graphVersion + 1);
    const nodes = new Map<string, NodeDefinition>();
    const edges: EdgeDefinition[] = [];
    const addNode = (node: NodeDefinition): void => {
      nodes.set(`${node.refType}:${node.refId}`, node);
    };
    const addEdge = (
      from: string,
      to: string,
      edgeType: GraphEdgeType,
      confidence = 1,
      sourceRefs: string[] = [],
    ): void => {
      edges.push({ confidence, edgeType, from, sourceRefs, to });
    };
    const caseKey = `Case:${caseDocument._id}`;
    addNode({
      label: caseDocument.title,
      metadata: { caseKey: caseDocument.caseKey },
      nodeType: "CASE",
      refId: caseDocument._id.toString(),
      refType: "Case",
    });
    for (const item of evidence) {
      const key = `Evidence:${item._id}`;
      addNode({
        label: item.label ?? item.originalFilename ?? item.kind,
        metadata: { kind: item.kind, status: item.processingStatus },
        nodeType: "EVIDENCE",
        refId: item._id.toString(),
        refType: "Evidence",
      });
      addEdge(caseKey, key, "HAS_EVIDENCE");
    }
    for (const block of blocks) {
      const key = `EvidenceBlock:${block._id}`;
      addNode({
        label: block.text.slice(0, 120),
        metadata: {
          blockIndex: block.blockIndex,
          pageNumber: block.pageNumber,
        },
        nodeType: "EVIDENCE_BLOCK",
        refId: block._id.toString(),
        refType: "EvidenceBlock",
      });
      addEdge(`Evidence:${block.evidenceId}`, key, "HAS_BLOCK");
    }
    for (const claim of claims) {
      const key = `Claim:${claim._id}`;
      addNode({
        label: claim.text.slice(0, 160),
        metadata: { status: claim.status, type: claim.normalizedType },
        nodeType: "CLAIM",
        refId: claim._id.toString(),
        refType: "Claim",
      });
      addEdge(caseKey, key, "SUPPORTS", claim.confidence);
      for (const source of claim.sourceRefs) {
        if (source.sourceType === "EVIDENCE_BLOCK")
          addEdge(
            `EvidenceBlock:${source.sourceId}`,
            key,
            "SUPPORTS",
            claim.confidence,
            [source.sourceId],
          );
      }
    }
    for (const event of timeline) {
      const key = `TimelineEvent:${event._id}`;
      addNode({
        label: event.eventText.slice(0, 160),
        metadata: {
          date: event.normalizedDate,
          precision: event.datePrecision,
        },
        nodeType: "TIMELINE_EVENT",
        refId: event._id.toString(),
        refType: "TimelineEvent",
      });
      addEdge(
        caseKey,
        key,
        "OCCURRED_ON",
        event.confidence,
        event.sourceRefs.map((source) => source.sourceId),
      );
    }
    if (procedure && procedureVersion) {
      const procedureKey = `Procedure:${procedure._id}`;
      addNode({
        label: procedure.institutionName ?? "Procedure",
        metadata: {
          status: procedure.status,
          version: procedureVersion.version,
        },
        nodeType: "PROCEDURE",
        refId: procedure._id.toString(),
        refType: "Procedure",
      });
      addEdge(caseKey, procedureKey, "APPLIES_TO");
      for (const proceduralClaim of proceduralClaims) {
        const key = `ProceduralClaim:${proceduralClaim._id}`;
        addNode({
          label: proceduralClaim.humanText.slice(0, 160),
          metadata: {
            status: proceduralClaim.verificationStatus,
            type: proceduralClaim.type,
          },
          nodeType: "PROCEDURAL_CLAIM",
          refId: proceduralClaim._id.toString(),
          refType: "ProceduralClaim",
        });
        addEdge(procedureKey, key, "REQUIRES", proceduralClaim.confidence);
      }
    }
    for (const requirement of requirements) {
      const key = `EvidenceRequirementMatch:${requirement._id}`;
      addNode({
        label: requirement.requirementText,
        metadata: {
          critical: requirement.critical,
          status: requirement.status,
        },
        nodeType: "REQUIREMENT",
        refId: requirement._id.toString(),
        refType: "EvidenceRequirementMatch",
      });
      addEdge(caseKey, key, "REQUIRES", requirement.confidence);
      for (const claimId of requirement.claimIds)
        addEdge(`Claim:${claimId}`, key, "SUPPORTS", requirement.confidence);
    }
    for (const contradiction of contradictions) {
      const key = `Contradiction:${contradiction._id}`;
      addNode({
        label: contradiction.explanation,
        metadata: {
          kind: contradiction.kind,
          severity: contradiction.severity,
          status: contradiction.status,
        },
        nodeType: "CONTRADICTION",
        refId: contradiction._id.toString(),
        refType: "Contradiction",
      });
      addEdge(`Claim:${contradiction.claimAId}`, key, "CONTRADICTS", 1);
      addEdge(`Claim:${contradiction.claimBId}`, key, "CONTRADICTS", 1);
    }
    const persistedNodes = new Map<string, GraphNodeDocument>();
    for (const node of nodes.values()) {
      const persisted = await this.nodeModel
        .findOneAndUpdate(
          {
            caseId: caseDocument._id,
            refType: node.refType,
            refId: node.refId,
          },
          { $set: { ...node, caseId: caseDocument._id, version } },
          { new: true, upsert: true },
        )
        .exec();
      if (persisted)
        persistedNodes.set(`${node.refType}:${node.refId}`, persisted);
    }
    const persistedEdges: GraphEdgeDocument[] = [];
    for (const edge of edges) {
      const from = persistedNodes.get(edge.from);
      const to = persistedNodes.get(edge.to);
      if (!from || !to || from._id.equals(to._id)) continue;
      const persisted = await this.edgeModel
        .findOneAndUpdate(
          {
            caseId: caseDocument._id,
            fromNodeId: from._id,
            toNodeId: to._id,
            edgeType: edge.edgeType,
          },
          {
            $set: {
              ...edge,
              caseId: caseDocument._id,
              fromNodeId: from._id,
              toNodeId: to._id,
              version,
            },
          },
          { new: true, upsert: true },
        )
        .exec();
      if (persisted) persistedEdges.push(persisted);
    }
    await this.nodeModel
      .deleteMany({ caseId: caseDocument._id, version: { $lt: version } })
      .exec();
    await this.edgeModel
      .deleteMany({ caseId: caseDocument._id, version: { $lt: version } })
      .exec();
    await this.caseModel
      .updateOne(
        { _id: caseDocument._id, deletedAt: null },
        { $set: { graphVersion: version } },
      )
      .exec();
    return {
      edges: persistedEdges,
      nodes: [...persistedNodes.values()],
      version,
    };
  }

  async getForCase(
    ownerId: string,
    caseId: string,
  ): Promise<{
    version: number;
    nodes: GraphNodeDocument[];
    edges: GraphEdgeDocument[];
  }> {
    const caseDocument = await this.ownedCase(ownerId, caseId);
    const [nodes, edges] = await Promise.all([
      this.nodeModel
        .find({ caseId: caseDocument._id, version: caseDocument.graphVersion })
        .sort({ refType: 1, refId: 1 })
        .exec(),
      this.edgeModel
        .find({ caseId: caseDocument._id, version: caseDocument.graphVersion })
        .sort({ edgeType: 1 })
        .exec(),
    ]);
    return { edges, nodes, version: caseDocument.graphVersion };
  }

  private async activeCase(
    caseId: string,
  ): Promise<Case & { _id: Types.ObjectId }> {
    if (!isValidObjectId(caseId))
      throw new NotFoundException("Case not found.");
    const value = await this.caseModel
      .findOne({ _id: new Types.ObjectId(caseId), deletedAt: null })
      .exec();
    if (!value) throw new NotFoundException("Case not found.");
    return value;
  }

  private async ownedCase(
    ownerId: string,
    caseId: string,
  ): Promise<Case & { _id: Types.ObjectId }> {
    if (!isValidObjectId(caseId))
      throw new NotFoundException("Case not found.");
    const value = await this.caseModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: new Types.ObjectId(caseId),
          deletedAt: null,
        }),
      )
      .exec();
    if (!value) throw new NotFoundException("Case not found.");
    return value;
  }
}
