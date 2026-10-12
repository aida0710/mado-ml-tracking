import type { LineageGraph } from '@mmt/contracts';

/** Follows confirmed parents once, including shared ancestors, without inferring missing stages. */
export function buildDatasetAncestors(input: {
  versionIds: readonly string[];
  parents: ReadonlyMap<string, readonly string[]>;
  labels?: ReadonlyMap<string, string>;
}): LineageGraph {
  const graph: LineageGraph = { nodes: [], edges: [] };
  const pending = [...input.versionIds];
  const visited = new Set<string>();
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index]!;
    if (visited.has(id)) continue;
    visited.add(id);
    graph.nodes.push({ id, kind: 'datasetVersion', label: input.labels?.get(id) ?? id });
    for (const parentId of new Set(input.parents.get(id) ?? [])) {
      graph.edges.push({ source: parentId, target: id, relation: 'parentDataset' });
      pending.push(parentId);
    }
  }
  return graph;
}
