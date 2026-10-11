import { describe, expect, it } from 'vitest';
import type { LineageGraph } from '@mmt/contracts';
import { focusLineage, runsUsingInput } from './lineageFocus';

const graph: LineageGraph = {
  nodes: [
    { id: 'parent', kind: 'datasetVersion', label: 'corpus 1' },
    { id: 'data', kind: 'datasetVersion', label: 'corpus 2' },
    { id: 'sibling', kind: 'datasetVersion', label: 'corpus 2b' },
    { id: 'train', kind: 'run', label: 'train', status: 'finished' },
    { id: 'model', kind: 'modelVersion', label: 'model v1' },
    { id: 'eval', kind: 'run', label: 'eval', status: 'finished' },
    { id: 'unrelated', kind: 'run', label: 'other', status: 'finished' },
  ],
  edges: [
    { source: 'parent', target: 'data', relation: 'parentDataset' },
    { source: 'parent', target: 'sibling', relation: 'parentDataset' },
    { source: 'data', target: 'train', relation: 'input' },
    { source: 'train', target: 'model', relation: 'outputModel' },
    { source: 'model', target: 'eval', relation: 'model' },
  ],
};

describe('focusLineage', () => {
  it('前後n段だけを残し、共通の親を経由した兄弟は含めない', () => {
    const focused = focusLineage(graph, { nodeId: 'data', depth: 2 });
    expect(focused?.nodes.map((node) => node.id)).toEqual(['parent', 'data', 'train', 'model']);
    expect(focused?.edges).toHaveLength(3);
  });

  it('グラフに無いノードを中心にはできない', () => {
    expect(focusLineage(graph, { nodeId: 'missing', depth: 2 })).toBeNull();
  });
});

describe('runsUsingInput', () => {
  it('データセットのバージョンを入力にしたRunだけを返す', () => {
    expect(runsUsingInput(graph, 'data').map((node) => node.id)).toEqual(['train']);
    expect(runsUsingInput(graph, 'parent')).toEqual([]);
  });
});
