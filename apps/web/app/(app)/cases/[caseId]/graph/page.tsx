"use client";

import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import { useParams } from "next/navigation";
import { useGraph } from "../../../../../lib/queries";
import type { GraphFlowEdge, GraphFlowNode } from "../../../../../lib/types";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../../../../../components/ui";

export default function GraphPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const query = useGraph(caseId);
  const [showTable, setShowTable] = useState(false);
  const flow = useMemo(() => {
    const source = query.data;
    if (!source) return null;
    const nodes: GraphFlowNode[] = source.nodes.map((node, index) => ({
      id: node.id,
      position: {
        x: (index % 3) * 260 + 30,
        y: Math.floor(index / 3) * 150 + 30,
      },
      data: {
        label: node.label,
        nodeType: node.nodeType,
        metadata: node.metadata,
      },
      type: "default",
    }));
    const edges: GraphFlowEdge[] = source.edges.map((edge) => ({
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      label: edge.edgeType,
      data: { edgeType: edge.edgeType, confidence: edge.confidence },
      animated: false,
    }));
    return { nodes, edges, version: source.version };
  }, [query.data]);
  if (query.isLoading) return <LoadingState label="Loading case graph" />;
  if (query.isError)
    return (
      <ErrorState
        message="The persisted graph is unavailable."
        retry={() => void query.refetch()}
      />
    );
  if (!flow || flow.nodes.length === 0)
    return (
      <div>
        <PageHeader
          eyebrow="Case graph"
          title="Evidence graph"
          description="Entities, claims, requirements, and procedural relationships persisted for this case."
        />
        <EmptyState
          title="Graph not built yet"
          description="The graph is created by the backend intelligence pipeline after evidence analysis. No browser-side relationships are invented."
        />
      </div>
    );
  return (
    <div>
      <PageHeader
        eyebrow="Case graph"
        title="Evidence graph"
        description={`Persisted graph version ${flow.version}. The table below is the accessible fallback for the visual graph.`}
        action={
          <button
            className="rounded-xl border-2 border-pencil px-4 py-2 text-sm font-semibold"
            onClick={() => setShowTable((value) => !value)}
          >
            {showTable ? "Show visual graph" : "Show accessible table"}
          </button>
        }
      />
      {showTable ? (
        <Card>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">
                Case graph nodes and relationships
              </caption>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Relationship</th>
                  <th>To</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {flow.edges.map((edge) => (
                  <tr key={edge.id}>
                    <td>
                      {flow.nodes.find((node) => node.id === edge.source)?.data
                        .label || edge.source}
                    </td>
                    <td>
                      <StatusBadge
                        status={edge.data?.edgeType || "RELATIONSHIP"}
                      />
                    </td>
                    <td>
                      {flow.nodes.find((node) => node.id === edge.target)?.data
                        .label || edge.target}
                    </td>
                    <td>
                      {edge.data?.confidence == null
                        ? "Unknown"
                        : `${Math.round(edge.data.confidence * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 space-y-3">
            {flow.nodes.map((node) => (
              <div key={node.id} className="rounded-xl border border-line p-3">
                <p className="font-semibold">{node.data.label}</p>
                <p className="text-xs text-pencil-muted">
                  {node.data.nodeType} · {node.id}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className="graph-canvas">
          <ReactFlow
            nodes={flow.nodes}
            edges={flow.edges}
            fitView
            proOptions={{ hideAttribution: true }}
            aria-label="Interactive case graph"
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
