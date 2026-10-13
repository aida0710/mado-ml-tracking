import dagre from '@dagrejs/dagre';
import type { LineageFlowElements, LineageFlowLayout, LineagePoint } from '../types/lineage';

// Match Data Catalog's fixed cards, spacing and left-to-right layout.
export const GRAPH_NODE_WIDTH = 224;
export const GRAPH_NODE_HEIGHT = 78;
const GRAPH_NODE_GAP = 30;
const GRAPH_RANK_GAP = 92;
const GRAPH_PADDING = 24;

export function layoutLineage(elements: LineageFlowElements): LineageFlowLayout {
  if (!elements.nodes.length) return { nodes: [], edges: [], width: 0, height: 0 };
  // A dataset can have several relations to one Run; never collapse parallel edges.
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'LR',
    nodesep: GRAPH_NODE_GAP,
    ranksep: GRAPH_RANK_GAP,
    marginx: GRAPH_PADDING,
    marginy: GRAPH_PADDING,
  });
  for (const node of elements.nodes)
    graph.setNode(node.id, { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT });
  for (const edge of elements.edges)
    graph.setEdge({ v: edge.source, w: edge.target, name: edge.id }, {});
  dagre.layout(graph);
  return {
    width: graph.graph().width!,
    height: graph.graph().height!,
    nodes: elements.nodes.map((node) => {
      const position = graph.node(node.id);
      return {
        ...node,
        position: {
          x: position.x - GRAPH_NODE_WIDTH / 2,
          y: position.y - GRAPH_NODE_HEIGHT / 2,
        },
      };
    }),
    edges: elements.edges.map((edge) => {
      const route = graph.edge({ v: edge.source, w: edge.target, name: edge.id });
      return {
        ...edge,
        data: {
          relation: edge.data!.relation,
          points: route.points.map((point: LineagePoint) => ({ x: point.x, y: point.y })),
        },
      };
    }),
  };
}
