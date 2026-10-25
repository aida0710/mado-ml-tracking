import type {
  AutomatedRunSummary,
  LineageEdge,
  LineageGraph,
  LineageNode,
  Model,
  ModelVersion,
  Run,
} from '@mmt/contracts';

import { buildDatasetAncestors } from './datasetLineage';
import { getModelTrainingSourceRunId } from './modelTrainingSource';

// 帯には最新の結果だけを出す。全部の一覧はその下の表にある。
export const LINEAGE_RESULT_RUN_LIMIT = 20;

/**
 * 学習Run → バージョン → 推論・評価Runを、LineageGraphが描く形にしたもの。結果のRunは、親も
 * そのバージョンの結果であれば（つながった段階）親の下に、そうでなければバージョンそのものの下に
 * 置く。
 */
export function buildModelVersionLineage(input: {
  model: Pick<Model, 'name'>;
  version: Pick<ModelVersion, 'id' | 'version' | 'sourceRunId' | 'trainingSourceRunId'>;
  sourceRun:
    | (Pick<Run, 'id' | 'name' | 'status'> &
        Partial<Pick<Run, 'inputDatasetVersionIds' | 'trainingDatasetVersionIds'>>)
    | null;
  datasetLabels?: ReadonlyMap<string, string>;
  datasetParents?: ReadonlyMap<string, readonly string[]>;
  resultRuns: readonly Pick<AutomatedRunSummary, 'id' | 'name' | 'status' | 'parentRunId'>[];
}): LineageGraph {
  const { model, version, sourceRun } = input;
  const sourceRunId = getModelTrainingSourceRunId(version);
  const resultRuns = input.resultRuns.slice(0, LINEAGE_RESULT_RUN_LIMIT);
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  if (sourceRunId) {
    nodes.push({
      id: sourceRunId,
      kind: 'run',
      label: sourceRun?.name ?? sourceRunId,
      ...(sourceRun ? { status: sourceRun.status } : {}),
    });
    edges.push({
      source: sourceRunId,
      target: version.id,
      relation: version.sourceRunId ? 'registeredModel' : 'outputModel',
    });
    const inputs = sourceRun?.trainingDatasetVersionIds ?? sourceRun?.inputDatasetVersionIds ?? [];
    const ancestors = buildDatasetAncestors({
      versionIds: inputs,
      parents: input.datasetParents ?? new Map(),
      labels: input.datasetLabels,
    });
    nodes.push(...ancestors.nodes);
    edges.push(...ancestors.edges);
    for (const id of inputs)
      edges.push({ source: id, target: sourceRunId, relation: 'input' });
  }
  nodes.push({ id: version.id, kind: 'modelVersion', label: `${model.name} / ${version.version}` });
  const resultIds = new Set(resultRuns.map((run) => run.id));
  for (const run of resultRuns) {
    nodes.push({ id: run.id, kind: 'run', label: run.name, status: run.status });
    const isChained = run.parentRunId !== null && resultIds.has(run.parentRunId);
    edges.push(
      isChained
        ? { source: run.parentRunId!, target: run.id, relation: 'parentRun' }
        : { source: version.id, target: run.id, relation: 'model' },
    );
  }
  return { nodes, edges };
}
