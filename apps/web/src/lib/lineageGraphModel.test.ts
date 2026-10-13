import { describe, expect, it } from 'vitest';
import type { LineageGraph, LineageNode } from '@mmt/contracts';
import { toLineageFlowElements } from './lineageGraphModel';
import { lineageNodeUrl } from './lineageNodeUrl';
import { shortenLineageLabel } from './lineageNodeLabel';

const kinds: LineageNode['kind'][] = [
  'datasetVersion',
  'run',
  'modelVersion',
  'loggedModel',
  'codeVersion',
];

describe('MMTの関係と詳細へのリンク', () => {
  it('全種類を保持し、同じ両端の複数関係を別の識別子にする', () => {
    const graph: LineageGraph = {
      nodes: kinds.map((kind) => ({ id: kind, kind, label: kind })),
      edges: [
        { source: 'run', target: 'modelVersion', relation: 'outputModel' },
        { source: 'run', target: 'modelVersion', relation: 'model' },
        { source: 'missing', target: 'modelVersion', relation: 'model' },
      ],
    };
    const before = structuredClone(graph);
    const elements = toLineageFlowElements({ graph, projectId: 'project' });
    expect(elements.nodes.map((node) => node.data.node.kind)).toEqual(kinds);
    expect(elements.edges).toHaveLength(2);
    expect(new Set(elements.edges.map((edge) => edge.id)).size).toBe(2);
    expect(graph).toEqual(before);
  });

  it('種類に応じた詳細を開き、Logged Modelは元のRunのArtifactsへ進む', () => {
    const urls = kinds.map((kind) =>
      lineageNodeUrl('project', { id: kind, kind, label: kind, sourceRunId: 'source-run' }),
    );
    expect(urls).toEqual([
      '/projects/project/datasets?version=datasetVersion',
      '/projects/project/runs/run',
      '/projects/project/models?version=modelVersion',
      '/projects/project/runs/source-run?tab=artifacts',
      '/projects/project/codes?version=codeVersion',
    ]);
    expect(lineageNodeUrl('project', { id: 'logged', kind: 'loggedModel', label: 'Logged' })).toBe(
      '/projects/project/artifacts',
    );
  });

  it('長い名前は先頭と末尾を残すので同じ前置きでも見分けられる', () => {
    const first = shortenLineageLabel(
      '推論出力の音声 run-9233bdc3-3649-43c2-967d-3307fe08d21b',
      28,
    );
    const second = shortenLineageLabel(
      '推論出力の音声 run-06882824-f1f5-4b06-8fa9-c40ecf6d1543',
      28,
    );
    expect(first).toHaveLength(28);
    expect(first).not.toBe(second);
    expect(first.endsWith('08d21b')).toBe(true);
  });
});
