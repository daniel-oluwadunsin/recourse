import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import { graphEdgeTypeValues, type GraphEdgeType } from "@recourse/contracts";

@Schema({ collection: "graph_edges", timestamps: true })
export class GraphEdge {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ ref: "GraphNode", required: true, type: SchemaTypes.ObjectId })
  fromNodeId!: Types.ObjectId;

  @Prop({ ref: "GraphNode", required: true, type: SchemaTypes.ObjectId })
  toNodeId!: Types.ObjectId;

  @Prop({ enum: [...graphEdgeTypeValues], required: true, type: String })
  edgeType!: GraphEdgeType;

  @Prop({ min: 0, max: 1, required: true, type: Number })
  confidence!: number;

  @Prop({ default: [], type: [String] })
  sourceRefs!: string[];

  @Prop({ min: 1, required: true, type: Number })
  version!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type GraphEdgeDocument = HydratedDocument<GraphEdge>;
export const GraphEdgeSchema = SchemaFactory.createForClass(GraphEdge);

GraphEdgeSchema.index(
  { caseId: 1, version: 1 },
  { name: "graph_edges_case_version" },
);
GraphEdgeSchema.index(
  { caseId: 1, fromNodeId: 1, toNodeId: 1, edgeType: 1 },
  { name: "graph_edges_case_pair_unique", unique: true },
);
