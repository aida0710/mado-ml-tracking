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
        throw new DomainError({
          status: 422,
          code: 'workflow_source_not_finished',
          message: 'the source step has not finished',
        });
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
        throw new DomainError({
          status: 422,
          code: 'workflow_outputs_missing',
          message: 'the specified output dataset does not exist',
        });
      if (binding.source.datasetName !== null && ids.length > 1)
        throw new DomainError({
          status: 422,
          code: 'workflow_outputs_ambiguous',
          message: 'there are multiple output datasets with the same name; keep one output',
        });
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
    throw new DomainError({
      status: 422,
      code: 'workflow_inputs_limit',
      message: 'the number of input datasets exceeds the limit',
    });
  let modelVersionId = request.step.task.modelVersionId;
  if (request.step.modelFromStepKey) {
    const source = completedByKey.get(request.step.modelFromStepKey);
    if (!source || source.status !== 'finished' || source.outputModelVersionIds.length !== 1)
      throw new DomainError({
        status: 422,
        code: 'workflow_model_output_required',
        message: 'a model source requires exactly one output model',
      });
    modelVersionId = source.outputModelVersionIds[0]!;
  }
  return {
    usage,
    upstreamDatasetVersionIds: [...new Set(upstreamDatasetVersionIds)],
    modelVersionId,
  };
}
