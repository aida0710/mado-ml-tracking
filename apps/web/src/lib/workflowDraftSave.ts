import {
  PREPROCESSING_METRIC_PREFIX,
  PREPROCESSING_SUMMARY_METRIC_NAMES,
  type ExperimentTask,
  type WorkflowQualityGate,
  type WorkflowStepInput,
} from '@mmt/contracts';
import { workflowQualityGateSchema, workflowStepInputSchema } from '@mmt/contracts/schemas';
import { workflowsText, workflowsTextTemplates } from '../i18n/workflows';
import { formatList } from '../i18n/textJoining';
import { parseJsonObjectOrNull } from './formValues';
import { LocalizedError } from './localizedError';
import type { WorkflowInputDraft, WorkflowStepDraft } from './workflowDraft';

/*
 * ワークフローの下書きを保存するとどうなるか、または保存できない最初の理由。APIがもう一度
 * 確かめる前に、ここで確かめる。
 */

/** 読まれたときの表示言語で問題を説明する。 */
type DescribeProblem = () => string;

const SUMMARY_METRIC_NAMES: ReadonlySet<string> = new Set(PREPROCESSING_SUMMARY_METRIC_NAMES);

/** ステップ自体（入力や条件ではなく）を保存できなくしている理由。 */
function stepProblem(
  step: WorkflowStepDraft,
  { task, earlierKeys }: { task: ExperimentTask | undefined; earlierKeys: readonly string[] },
): DescribeProblem | null {
  if (!step.name.trim() || !step.key.trim())
    return () => workflowsText.workflowDraftNameOrKeyMissing;
  if (earlierKeys.includes(step.key))
    return () => workflowsTextTemplates.workflowDraftDuplicateKey(step.key);
  if (!task) return () => workflowsText.workflowDraftTaskMissing;
  if (step.modelFromStepKey !== null && !earlierKeys.includes(step.modelFromStepKey))
    return () => workflowsText.workflowDraftModelSourceNotEarlier;
  return null;
}

/** 1つの入力を保存できなくしている理由。 */
function inputProblem(
  input: WorkflowInputDraft,
  earlierKeys: readonly string[],
): DescribeProblem | null {
  const { source, weight } = input.binding;
  if (source.kind === 'dataset' && !source.datasetVersionId)
    return () => workflowsText.workflowDraftDatasetVersionMissing;
  if (source.kind === 'step' && !earlierKeys.includes(source.stepKey))
    return () => workflowsText.workflowDraftSourceStepNotEarlier;
  if (!Number.isFinite(weight) || weight <= 0)
    return () => workflowsText.workflowDraftWeightInvalid;
  if (!parseJsonObjectOrNull(input.selectionJson))
    return () => workflowsText.workflowDraftSelectionInvalid;
  return null;
}

/**
 * 1つの品質条件を保存できなくしている理由。preprocessing.*の名前は、レポートが計算するもので
 * なければならない。それ以外の名前はコード自身のメトリクス。
 */
function gateProblem(gate: WorkflowQualityGate): DescribeProblem | null {
  if (!workflowQualityGateSchema.safeParse(gate).success)
    return () => workflowsText.workflowDraftGateInvalid;
  if (gate.metric.startsWith(PREPROCESSING_METRIC_PREFIX) && !SUMMARY_METRIC_NAMES.has(gate.metric))
    return () =>
      workflowsTextTemplates.workflowDraftUnknownPreprocessingMetric(
        formatList(PREPROCESSING_SUMMARY_METRIC_NAMES),
      );
  return null;
}

/**
 * 下書きを保存できない最初の理由。ステップ（とその入力か品質条件）を1からの位置で示す。無ければ
 * null。ステップは前のステップだけを参照する。
 */
function findWorkflowDraftProblem(
  steps: WorkflowStepDraft[],
  tasks: ExperimentTask[],
): DescribeProblem | null {
  for (const [stepIndex, step] of steps.entries()) {
    const stepNumber = stepIndex + 1;
    const earlierKeys = steps.slice(0, stepIndex).map((earlier) => earlier.key);
    const task = tasks.find((item) => item.id === step.taskId);
    const describeStepProblem = stepProblem(step, { task, earlierKeys });
    if (describeStepProblem)
      return () =>
        workflowsTextTemplates.workflowDraftStepProblem(stepNumber, describeStepProblem());
    for (const [inputIndex, input] of step.inputs.entries()) {
      const describeInputProblem = inputProblem(input, earlierKeys);
      if (describeInputProblem)
        return () =>
          workflowsTextTemplates.workflowDraftInputProblem(
            stepNumber,
            inputIndex + 1,
            describeInputProblem(),
          );
    }
    for (const [gateIndex, gate] of step.qualityGates.entries()) {
      const describeGateProblem = gateProblem(gate);
      if (describeGateProblem)
        return () =>
          workflowsTextTemplates.workflowDraftGateProblem(
            stepNumber,
            gateIndex + 1,
            describeGateProblem(),
          );
    }
  }
  return null;
}

/**
 * 保存するステップ。それぞれにTaskの今のリビジョンを付ける（バージョンがそれを固定する）。
 * 直すステップと項目を示すLocalizedErrorを投げる。
 */
export function pinWorkflowDrafts(
  steps: WorkflowStepDraft[],
  tasks: ExperimentTask[],
): WorkflowStepInput[] {
  const describeProblem = findWorkflowDraftProblem(steps, tasks);
  if (describeProblem) throw new LocalizedError(describeProblem);
  return steps.map((step, index) => {
    const task = tasks.find((item) => item.id === step.taskId)!;
    const parsed = workflowStepInputSchema.safeParse({
      ...step,
      inputs: step.inputs.map(({ binding, selectionJson }) => ({
        ...binding,
        selection: parseJsonObjectOrNull(selectionJson),
      })),
      expectedTaskRevision: task.revision,
    });
    // 上の検査で繰り返さない上限（長さ、個数）の違反でも、ステップを示す。
    if (!parsed.success)
      throw new LocalizedError(() =>
        workflowsTextTemplates.workflowDraftStepProblem(
          index + 1,
          workflowsText.workflowDraftStepInvalid,
        ),
      );
    return parsed.data;
  });
}
