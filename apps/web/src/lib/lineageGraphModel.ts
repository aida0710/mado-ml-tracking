import type { LineageGraph } from '@mmt/contracts';
import { MarkerType, Position } from '@xyflow/react';
import type { LineageFlowElements } from '../types/lineage';
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from './lineageLayout';

// 矢印の大きさはmado S3 Data Catalogに合わせ、関係の種類はmado ML Trackingのものを残す。
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
      // カードの中には詳細へのリンクがある。フォーカスできる選択用のgroupは、そのリンクと分けておく。
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
              // 両端が同じでも、並行する関係はそれぞれ別のものとして残す。
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
