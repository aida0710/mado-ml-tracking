// 1つのノードの周りに絞ったProjectの来歴。図全体を探さなくても「このデータから何が作られたか」を
// 読めるようにする。
import type { LineageGraph } from '@mmt/contracts';

/** Lineageの画面で、中心に置くノードを指すURLのパラメータ。 */
export const LINEAGE_FOCUS_PARAMETER = 'focus';

/**
 * `nodeId`から上流か下流へ、多くとも`depth`個（省けばすべて）の関係でたどれるノードと、それらの間の
 * 関係。向きはそれぞれ別にたどる（共通の親を経て届く兄弟は含めない）。ノードがグラフに無ければnull。
 */
export function focusLineage(graph: LineageGraph, focus: { nodeId: string; depth?: number }): LineageGraph | null {
  if (!graph.nodes.some((node) => node.id === focus.nodeId)) return null;
  const included = new Set([focus.nodeId]);
  for (const direction of ['upstream', 'downstream'] as const) {
    const visited = new Set([focus.nodeId]);
    let frontier = [focus.nodeId];
    for (let step = 0; (focus.depth === undefined || step < focus.depth) && frontier.length; step += 1) {
      const next: string[] = [];
      for (const edge of graph.edges) {
        const [from, to] = direction === 'downstream' ? [edge.source, edge.target] : [edge.target, edge.source];
        if (frontier.includes(from) && !visited.has(to)) {
          visited.add(to);
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

export function lineageFocusPath(projectId: string, nodeId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/lineage?${LINEAGE_FOCUS_PARAMETER}=${encodeURIComponent(nodeId)}`;
}

/** そのノード（データセットのバージョン）を入力にしたRun。グラフの順に並べる。 */
export function runsUsingInput(graph: LineageGraph, nodeId: string) {
  const runIds = new Set(
    graph.edges.filter((edge) => edge.relation === 'input' && edge.source === nodeId).map((edge) => edge.target),
  );
  return graph.nodes.filter((node) => node.kind === 'run' && runIds.has(node.id));
}
