import { describe, expect, it } from 'vitest';
import type { LineageGraph } from '@mmt/contracts';
import { toLineageFlowElements } from './lineageGraphModel';
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, layoutLineage } from './lineageLayout';

const run = (id: string) => ({ id, kind: 'run' as const, label: id });
const layout = (graph: LineageGraph) =>
  layoutLineage(toLineageFlowElements({ graph, projectId: 'project' }));

describe('Lineageの自動配置', () => {
  it('1行のグラフは項目の下に余分な行を作らない', () => {
    const positioned = layout({
      nodes: [run('train'), run('eval')],
      edges: [{ source: 'train', target: 'eval', relation: 'parentRun' }],
    });
    const bottom = Math.max(...positioned.nodes.map((node) => node.position.y + GRAPH_NODE_HEIGHT));
    expect(positioned.height - bottom).toBeLessThanOrEqual(30);
    expect(positioned.nodes[1]!.position.x).toBeGreaterThan(positioned.nodes[0]!.position.x);
  });

  it('列を飛ばす線は途中の項目と重ならない通り道を通る', () => {
    const positioned = layout({
      nodes: [run('a'), run('b'), run('c')],
      edges: [
        { source: 'a', target: 'b', relation: 'parentRun' },
        { source: 'b', target: 'c', relation: 'parentRun' },
        { source: 'a', target: 'c', relation: 'input' },
      ],
    });
    const middle = positioned.nodes.find((node) => node.id === 'b')!;
    const skipping = positioned.edges.find((edge) => edge.source === 'a' && edge.target === 'c')!;
    const passages = skipping.data!.points.filter(
      (point) => point.x >= middle.position.x && point.x <= middle.position.x + GRAPH_NODE_WIDTH,
    );
    expect(passages.length).toBeGreaterThan(0);
    for (const point of passages)
      expect(point.y < middle.position.y || point.y > middle.position.y + GRAPH_NODE_HEIGHT).toBe(
        true,
      );
  });

  it('独立した経路はつながる項目を同じ順に並べて線が交差しない', () => {
    const positioned = layout({
      nodes: [run('a1'), run('a2'), run('b2'), run('b1')],
      edges: [
        { source: 'a1', target: 'b1', relation: 'parentRun' },
        { source: 'a2', target: 'b2', relation: 'parentRun' },
      ],
    });
    const position = (id: string) => positioned.nodes.find((node) => node.id === id)!.position;
    expect(position('a1').y).toBeLessThan(position('a2').y);
    expect(position('b1').y).toBeLessThan(position('b2').y);
  });

  it('同じ両端の複数関係を別の線として配置し、元のグラフを変更しない', () => {
    const graph: LineageGraph = {
      nodes: [run('a'), run('b')],
      edges: [
        { source: 'a', target: 'b', relation: 'input' },
        { source: 'a', target: 'b', relation: 'parentRun' },
      ],
    };
    const before = structuredClone(graph);
    const positioned = layout(graph);
    expect(positioned.edges.map((edge) => edge.data!.relation)).toEqual(['input', 'parentRun']);
    expect(positioned.edges[0]!.data!.points).not.toEqual(positioned.edges[1]!.data!.points);
    expect(graph).toEqual(before);
  });

  it('孤立した項目や循環があっても全項目を有限の座標に配置する', () => {
    const positioned = layout({
      nodes: [run('a'), run('b'), run('isolated')],
      edges: [
        { source: 'a', target: 'b', relation: 'parentRun' },
        { source: 'b', target: 'a', relation: 'parentRun' },
        { source: 'a', target: 'a', relation: 'parentRun' },
      ],
    });
    expect(positioned.nodes.map((node) => node.id)).toEqual(['a', 'b', 'isolated']);
    expect(
      positioned.nodes.every(
        (node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y),
      ),
    ).toBe(true);
    expect(
      positioned.edges.every((edge) =>
        edge.data!.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
      ),
    ).toBe(true);
  });
});
