import type { LineageGraph } from '@mmt/contracts';
import { MarkerType, Position } from '@xyflow/react';
import type { LineageFlowElements } from '../types/lineage';
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from './lineageLayout';

// Matches Data Catalog's arrows while retaining MMT's relation identities.
const LINEAGE_ARROW_SIZE = 15;

export function toLineageFlowElements({
  graph,
  projectId,
}: {
  graph: LineageGraph;
  projectId: string;
}): LineageFlowElements {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: 'lineage',
      // The card contains a detail link; keep the focusable selection group separate from that link.
      ariaRole: 'group',
      position: { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      width: GRAPH_NODE_WIDTH,
      height: GRAPH_NODE_HEIGHT,
      data: { node, projectId },
    })),
    edges: graph.edges.flatMap((edge, index) =>
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
        ? [
            {
              // Parallel relations must stay distinct even when their endpoints are the same.
              id: `lineage-edge:${index}`,
              source: edge.source,
              target: edge.target,
              type: 'lineage' as const,
              data: { relation: edge.relation, points: [] },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: LINEAGE_ARROW_SIZE,
                height: LINEAGE_ARROW_SIZE,
              },
            },
          ]
        : [],
    ),
  };
}
