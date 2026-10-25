import type { WorkflowStep, WorkflowStepExecution } from '@mmt/contracts';

/**
 * ステップのRunが親として記録するRun。workerはこれを上流のRunとしてステップに渡す
 * （MMT_UPSTREAM_RUN_ID、upstream-run.json）。
 * 1. 出力データセットをこのステップが読む前のステップのうち、いちばん近いもの。こうして上流の
 *    Runは、RunがupstreamDatasetVersionIdsに出力を記録しているRunになる。
 * 2. それが無ければ、モデルを渡すステップ（modelFromStepKey）。
 * 3. それも無ければ無し。固定したデータセットとモデルだけを読むステップには上流のRunが無い。
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
