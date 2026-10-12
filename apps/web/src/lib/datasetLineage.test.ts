import { describe, expect, it } from 'vitest';
import { buildDatasetAncestors } from './datasetLineage';
import { buildModelVersionLineage } from './modelVersionLineage';

describe('登録済みモデルからデータの生成元をたどる', () => {
  it('追加した加工音声の親を特徴量と学習Runの前に表示し、学習の直接入力とは区別する', () => {
    const graph = buildModelVersionLineage({
      model: { name: 'Model' },
      version: { id: 'model', version: 'v1', sourceRunId: null, trainingSourceRunId: 'training' },
      sourceRun: {
        id: 'training',
        name: 'Training',
        status: 'finished',
        inputDatasetVersionIds: ['style'],
      },
      datasetParents: new Map([
        ['style', ['features']],
        ['features', ['processed-audio']],
      ]),
      datasetLabels: new Map([['processed-audio', '加工音声32tar']]),
      resultRuns: [],
    });
    expect(graph.nodes.find((node) => node.id === 'processed-audio')?.label).toBe('加工音声32tar');
    expect(graph.edges).toContainEqual({
      source: 'processed-audio',
      target: 'features',
      relation: 'parentDataset',
    });
    expect(graph.edges).toContainEqual({
      source: 'features',
      target: 'style',
      relation: 'parentDataset',
    });
    expect(graph.edges).toContainEqual({ source: 'style', target: 'training', relation: 'input' });
    expect(graph.edges).not.toContainEqual({
      source: 'processed-audio',
      target: 'training',
      relation: 'input',
    });
  });

  it('共有する生成元を一度だけ表示し、古い不正な循環でも探索が終わる', () => {
    const graph = buildDatasetAncestors({
      versionIds: ['a', 'b'],
      parents: new Map([
        ['a', ['parent', 'parent']],
        ['b', ['parent']],
        ['parent', ['a']],
      ]),
    });
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b', 'parent']);
    expect(graph.edges).toHaveLength(3);
  });
});
