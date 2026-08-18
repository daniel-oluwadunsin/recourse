import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";

import { graphNodeTypeValues, type GraphNodeType } from "@recourse/contracts";

@Schema({ collection: "graph_nodes", timestamps: true })
export class GraphNode {
  @Prop({ ref: "Case", required: true, type: SchemaTypes.ObjectId })
  caseId!: Types.ObjectId;

  @Prop({ enum: [...graphNodeTypeValues], required: true, type: String })
  nodeType!: GraphNodeType;

  @Prop({ required: true, type: String })
  refType!: string;

  @Prop({ required: true, type: String })
  refId!: string;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ default: {}, type: Object })
  metadata!: Record<string, unknown>;

  @Prop({ min: 1, required: true, type: Number })
  version!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type GraphNodeDocument = HydratedDocument<GraphNode>;
export const GraphNodeSchema = SchemaFactory.createForClass(GraphNode);

GraphNodeSchema.index(
  { caseId: 1, version: 1 },
  { name: "graph_nodes_case_version" },
);
GraphNodeSchema.index(
  { caseId: 1, refType: 1, refId: 1 },
  { name: "graph_nodes_case_ref_unique", unique: true },
);
