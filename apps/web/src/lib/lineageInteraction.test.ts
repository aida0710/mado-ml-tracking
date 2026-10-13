import { describe, expect, it } from 'vitest';
import type { LineageGraph, LineageNode } from '@mmt/contracts';
import { toLineageFlowElements } from './lineageGraphModel';
import { searchLineageNodes, traceLineagePath } from './lineageInteraction';

const nodes: LineageNode[] = ['parent', 'selected', 'sibling', 'child', 'isolated'].map((id) => ({
  id,
  kind: 'run',
  label: id,
}));
const graph: LineageGraph = {
  nodes,
  edges: [
    { source: 'parent', target: 'selected', relation: 'parentRun' },
    { source: 'parent', target: 'sibling', relation: 'parentRun' },
    { source: 'selected', target: 'child', relation: 'parentRun' },
    { source: 'selected', target: 'child', relation: 'input' },
  ],
};
const elements = toLineageFlowElements({ graph, projectId: 'project' });

const trace = (direction: 'both' | 'upstream' | 'downstream', selectedId = 'selected') =>
  traceLineagePath({ ...elements, direction, selectedId });

describe('Lineageの経路選択', () => {
  it('前後の経路を辿り、共通の生成元から分かれた兄弟は含めない', () => {
    expect([...trace('both').nodeIds].sort()).toEqual(['child', 'parent', 'selected']);
    expect([...trace('both').edgeIds].sort()).toEqual([
      'lineage-edge:0',
      'lineage-edge:2',
      'lineage-edge:3',
    ]);
  });
  it('生成元と生成先をそれぞれ辿る', () => {
    expect([...trace('upstream').nodeIds].sort()).toEqual(['parent', 'selected']);
    expect([...trace('downstream').nodeIds].sort()).toEqual(['child', 'selected']);
  });
  it('循環を一度ずつ辿り、存在しない選択は空にする', () => {
    const cyclic = toLineageFlowElements({
      graph: {
        ...graph,
        edges: [...graph.edges, { source: 'child', target: 'selected', relation: 'parentRun' }],
      },
      projectId: 'project',
    });
    expect(
      [
        ...traceLineagePath({ ...cyclic, direction: 'downstream', selectedId: 'selected' }).nodeIds,
      ].sort(),
    ).toEqual(['child', 'selected']);
    expect(trace('both', 'missing')).toEqual({ nodeIds: new Set(), edgeIds: new Set() });
  });
});

describe('Lineageの検索', () => {
  const searchable: LineageNode[] = [
    { id: 'dataset', kind: 'datasetVersion', label: '音声 Corpus Ｖ１' },
    { id: 'model', kind: 'modelVersion', label: 'Corpus V1' },
  ];
  const kindLabels = {
    datasetVersion: 'データセットバージョン',
    modelVersion: 'モデルバージョン',
    run: 'Run',
    codeVersion: 'コードバージョン',
    loggedModel: 'Logged Model',
  };
  it('名前と種類を複数語で検索し、全角と大小文字を揃える', () => {
    expect(
      searchLineageNodes({ nodes: searchable, query: 'データセット corpus v1', kindLabels }),
    ).toEqual([searchable[0]]);
  });
  it('空白だけでは検索結果を出さず、IDでも検索できる', () => {
    expect(searchLineageNodes({ nodes: searchable, query: '  ', kindLabels })).toEqual([]);
    expect(searchLineageNodes({ nodes: searchable, query: 'MODEL', kindLabels })).toEqual([
      searchable[1],
    ]);
  });
});
