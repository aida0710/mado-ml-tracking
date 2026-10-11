// A part of the Project's lineage around one node, so "what was made from this data" can be read
// without searching the whole diagram.
import type { LineageGraph } from '@mmt/contracts';

/** The Lineage page's URL parameter naming the node to center on. */
export const LINEAGE_FOCUS_PARAMETER = 'focus';

/**
 * Nodes at most `depth` relations upstream or downstream of `nodeId`, following each direction
 * on its own (a sibling reached through a shared parent is not included), and the relations
 * between them. Null when the node is not in the graph.
 */
export function focusLineage(graph: LineageGraph, focus: { nodeId: string; depth: number }): LineageGraph | null {
  if (!graph.nodes.some((node) => node.id === focus.nodeId)) return null;
  const included = new Set([focus.nodeId]);
  for (const direction of ['upstream', 'downstream'] as const) {
    let frontier = [focus.nodeId];
    for (let step = 0; step < focus.depth && frontier.length; step += 1) {
      const next: string[] = [];
      for (const edge of graph.edges) {
        const [from, to] = direction === 'downstream' ? [edge.source, edge.target] : [edge.target, edge.source];
        if (frontier.includes(from) && !included.has(to)) {
          included.add(to);
          next.push(to);
        }
      }
      frontier = next;
    }
  }
  return {
    nodes: graph.nodes.filter((node) => included.has(node.id)),
    edges: graph.edges.filter((edge) => included.has(edge.source) && included.has(edge.target)),
  };
}

/** Runs that took the node (a dataset version) as an input, in the graph's order. */
export function runsUsingInput(graph: LineageGraph, nodeId: string) {
  const runIds = new Set(
    graph.edges.filter((edge) => edge.relation === 'input' && edge.source === nodeId).map((edge) => edge.target),
  );
  return graph.nodes.filter((node) => node.kind === 'run' && runIds.has(node.id));
}
