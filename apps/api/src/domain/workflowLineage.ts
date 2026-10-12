import type { WorkflowStep, WorkflowStepExecution } from '@mmt/contracts';

/**
 * The Run a step's Run records as its parent, which the worker hands to the step as its upstream
 * Run (MMT_UPSTREAM_RUN_ID, upstream-run.json):
 * 1. the closest earlier step whose output datasets the step reads, so that the upstream Run is
 *    one whose outputs the Run records in upstreamDatasetVersionIds;
 * 2. otherwise the step that supplies its model (modelFromStepKey);
 * 3. otherwise none: a step that reads only pinned datasets and models has no upstream Run.
 */
export function workflowParentRunId(
  step: Pick<WorkflowStep, 'inputs' | 'modelFromStepKey'>,
  completed: readonly WorkflowStepExecution[],
): string | null {
  const completedByKey = new Map(completed.map((execution) => [execution.stepKey, execution]));
  const datasetSuppliers = step.inputs.flatMap((binding) => {
    const supplier =
      binding.source.kind === 'step' ? completedByKey.get(binding.source.stepKey) : undefined;
    return supplier ? [supplier] : [];
  });
  const closestDatasetSupplier = datasetSuppliers.reduce<WorkflowStepExecution | undefined>(
    (closest, supplier) =>
      !closest || supplier.stepIndex > closest.stepIndex ? supplier : closest,
    undefined,
  );
  const modelSupplier = step.modelFromStepKey
    ? completedByKey.get(step.modelFromStepKey)
    : undefined;
  return (closestDatasetSupplier ?? modelSupplier)?.runId ?? null;
}
