import type {
  ExperimentTask,
  PreprocessingSummaryMetricName,
  WorkflowDatasetBinding,
  WorkflowQualityGate,
  WorkflowStep,
  WorkflowStepInput,
} from '@mmt/contracts';

export interface WorkflowInputDraft {
  binding: WorkflowDatasetBinding;
  selectionJson: string;
}
export interface WorkflowStepDraft extends Omit<
  WorkflowStepInput,
  'expectedTaskRevision' | 'inputs'
> {
  inputs: WorkflowInputDraft[];
}

/** 品質条件の比べ方。定義とエディタが書くとおりの記号。 */
export const QUALITY_GATE_OPERATOR_SYMBOLS: Readonly<
  Record<WorkflowQualityGate['operator'], string>
> = {
  gte: '≥',
  lte: '≤',
  eq: '=',
};

// 前処理のレポートで残った入力の割合。続けるかどうかを決める、いつもの条件。
export const RETAINED_INPUT_RATIO_METRIC: PreprocessingSummaryMetricName =
  'preprocessing.retained_input_ratio';
// 新しい条件はよく使う閾値から始める。ワークフローごとに、保存する前に変えられる。
const DEFAULT_MIN_RETAINED_INPUT_RATIO = 0.9;
// 新しい入力は、誰かが重みを付けるまで、混合の中で1回分として数える。
const DEFAULT_INPUT_WEIGHT = 1;
const EMPTY_SELECTION_JSON = '{}';
const SELECTION_JSON_INDENT = 2;

export function newWorkflowStep(steps: WorkflowStepDraft[]): WorkflowStepDraft {
  let number = steps.length + 1;
  while (steps.some((step) => step.key === `step-${number}`)) number += 1;
  return {
    key: `step-${number}`,
    name: '',
    taskId: '',
    inputs: [],
    modelFromStepKey: null,
    qualityGates: [],
  };
}

export function newRetainedInputGate(): WorkflowQualityGate {
  return {
    metric: RETAINED_INPUT_RATIO_METRIC,
    operator: 'gte',
    threshold: DEFAULT_MIN_RETAINED_INPUT_RATIO,
  };
}

/** 入力にする、固定したデータセットのバージョン。選ぶまでは''。 */
export function newDatasetInput(
  datasetVersionId = '',
  role: WorkflowDatasetBinding['role'] = 'input',
): WorkflowInputDraft {
  return {
    binding: {
      source: { kind: 'dataset', datasetVersionId },
      role,
      weight: DEFAULT_INPUT_WEIGHT,
      selection: {},
    },
    selectionJson: EMPTY_SELECTION_JSON,
  };
}

/** 学習とファインチューニングは入力を学習データとして読み、ほかの種類はただの入力として読む。 */
export function defaultInputRole(
  task: Pick<ExperimentTask, 'kind'>,
): WorkflowDatasetBinding['role'] {
  return task.kind === 'training' || task.kind === 'finetuning' ? 'training' : 'input';
}

/** Taskが持つデータセットのバージョンをステップの入力にしたもの。Taskを選んだときに使う。 */
export function taskInputDrafts(task: ExperimentTask): WorkflowInputDraft[] {
  return task.inputDatasetVersionIds.map((datasetVersionId) =>
    newDatasetInput(datasetVersionId, defaultInputRole(task)),
  );
}

export function workflowStepDrafts(steps: WorkflowStep[]): WorkflowStepDraft[] {
  return steps.map(({ task, inputs, ...step }) => ({
    ...step,
    taskId: task.id,
    inputs: inputs.map((binding) => ({
      binding,
      selectionJson: JSON.stringify(binding.selection, null, SELECTION_JSON_INDENT),
    })),
  }));
}

/** ステップがモデルや入力を受け取れる前のステップ。キーごとに1つ。''はステップなし。 */
export function earlierStepChoices(
  steps: WorkflowStepDraft[],
  stepIndex: number,
): { value: string; label: string }[] {
  const labels = new Map<string, string>();
  for (const step of steps.slice(0, stepIndex))
    if (step.key && !labels.has(step.key)) labels.set(step.key, step.name || step.key);
  return [...labels].map(([value, label]) => ({ value, label }));
}

function withStepReferencesRenamed(
  step: WorkflowStepDraft,
  { from, to }: { from: string; to: string },
): WorkflowStepDraft {
  return {
    ...step,
    modelFromStepKey: step.modelFromStepKey === from ? to : step.modelFromStepKey,
    inputs: step.inputs.map((input) =>
      input.binding.source.kind === 'step' && input.binding.source.stepKey === from
        ? {
            ...input,
            binding: { ...input.binding, source: { ...input.binding.source, stepKey: to } },
          }
        : input,
    ),
  };
}

/**
 * `stepIndex`のステップのキーが`from`から`to`に変わったあと、それより後のステップのうち、
 * モデルか入力を`from`から受け取っていたものを`to`に向ける。ステップは前のステップだけを参照する。
 * 参照が確かに名前を変えたステップを指すとは言えないとき（ほかのステップもキー`from`か`to`を
 * 持つとき、キーが空にされたとき）は、何も書き換えない。そのとき参照は無いものとして、または
 * キーが前のステップで使われているものとして表示され、利用者が選び直す。
 */
export function renameStepReferences(
  steps: WorkflowStepDraft[],
  { stepIndex, from, to }: { stepIndex: number; from: string; to: string },
): WorkflowStepDraft[] {
  const otherKeys = steps.filter((_, index) => index !== stepIndex).map((step) => step.key);
  if (!from || !to || from === to || otherKeys.includes(from) || otherKeys.includes(to))
    return steps;
  return steps.map((step, index) =>
    index > stepIndex ? withStepReferencesRenamed(step, { from, to }) : step,
  );
}
