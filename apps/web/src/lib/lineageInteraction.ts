import type { LineageNode } from '@mmt/contracts';
import type { LineageDirection, LineageFlowElements, LineagePathSelection } from '../types/lineage';

export function traceLineagePath({
  nodes,
  edges,
  selectedId,
  direction,
}: LineageFlowElements & {
  selectedId: string;
  direction: LineageDirection;
}): LineagePathSelection {
  const available = new Set(nodes.map((node) => node.id));
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!available.has(selectedId)) return { nodeIds, edgeIds };
  const incoming = new Map(nodes.map((node) => [node.id, [] as typeof edges]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as typeof edges]));
  for (const edge of edges) {
    if (!available.has(edge.source) || !available.has(edge.target)) continue;
    incoming.get(edge.target)!.push(edge);
    outgoing.get(edge.source)!.push(edge);
  }
  // Walk each direction independently; a shared ancestor must not bring in a sibling branch.
  for (const traversal of ['upstream', 'downstream'] as const) {
    if (direction !== 'both' && direction !== traversal) continue;
    const visited = new Set([selectedId]);
    const queue = [selectedId];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]!;
      const adjacent = traversal === 'upstream' ? incoming.get(current)! : outgoing.get(current)!;
      for (const edge of adjacent) {
        const next = traversal === 'upstream' ? edge.source : edge.target;
        edgeIds.add(edge.id);
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    for (const id of visited) nodeIds.add(id);
  }
  return { nodeIds, edgeIds };
}

export function searchLineageNodes({
  nodes,
  query,
  kindLabels,
}: {
  nodes: LineageNode[];
  query: string;
  kindLabels: Record<LineageNode['kind'], string>;
}): LineageNode[] {
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return nodes.filter((node) => {
    const searchable = normalize(
      [node.id, node.label, kindLabels[node.kind], node.status ?? ''].join('\n'),
    );
    return terms.every((term) => searchable.includes(term));
  });
}
