import type { DatasetUsage, WorkflowStep, WorkflowStepExecution } from '@mmt/contracts';
import { WORKFLOW_MAX_INPUTS } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';
import { DomainError } from '../domain/errors.js';

export async function resolveWorkflowInputs(
  connection: Connection,
  request: {
    projectId: string;
    step: WorkflowStep;
    completed: WorkflowStepExecution[];
  },
): Promise<{
  usage: DatasetUsage[];
  upstreamDatasetVersionIds: string[];
  modelVersionId: string | null;
}> {
  const completedByKey = new Map(request.completed.map((step) => [step.stepKey, step]));
  const usage: DatasetUsage[] = [];
  const upstreamDatasetVersionIds: string[] = [];
  for (const binding of request.step.inputs) {
    let ids: string[];
    if (binding.source.kind === 'dataset') ids = [binding.source.datasetVersionId];
    else {
      const source = completedByKey.get(binding.source.stepKey);
      if (!source || source.status !== 'finished')
        throw new DomainError(
          422,
          '入力元のステップが完了していません',
          'workflow_source_not_finished',
        );
      const outputs = await rows<{ id: string; name: string }>(
        connection,
        `SELECT v.id,d.name FROM dataset_versions v JOIN datasets d ON d.id=v.dataset_id
         WHERE v.project_id=$1 AND v.id=ANY($2::uuid[]) ORDER BY v.id`,
        [request.projectId, source.outputDatasetVersionIds],
      );
      ids = outputs
        .filter(
          (output) =>
            binding.source.kind === 'step' &&
            (binding.source.datasetName === null || output.name === binding.source.datasetName),
        )
        .map((output) => output.id);
      if (!ids.length)
        throw new DomainError(
          422,
          '指定した出力データセットがありません',
          'workflow_outputs_missing',
        );
      if (binding.source.datasetName !== null && ids.length > 1)
        throw new DomainError(
          422,
          '同じ名前の出力データセットが複数あります。出力を一つにしてください',
          'workflow_outputs_ambiguous',
        );
      upstreamDatasetVersionIds.push(...ids);
    }
    usage.push(
      ...ids.map((datasetVersionId) => ({
        datasetVersionId,
        role: binding.role,
        weight: binding.weight,
        selection: binding.selection,
      })),
    );
  }
  if (usage.length > WORKFLOW_MAX_INPUTS)
    throw new DomainError(422, '入力データセットの数が上限を超えています', 'workflow_inputs_limit');
  let modelVersionId = request.step.task.modelVersionId;
  if (request.step.modelFromStepKey) {
    const source = completedByKey.get(request.step.modelFromStepKey);
    if (!source || source.status !== 'finished' || source.outputModelVersionIds.length !== 1)
      throw new DomainError(
        422,
        'モデルの入力元には出力モデルが一つ必要です',
        'workflow_model_output_required',
      );
    modelVersionId = source.outputModelVersionIds[0]!;
  }
  return {
    usage,
    upstreamDatasetVersionIds: [...new Set(upstreamDatasetVersionIds)],
    modelVersionId,
  };
}
