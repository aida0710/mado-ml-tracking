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

/** How a quality condition compares, as the definition and the editor write it. */
export const QUALITY_GATE_OPERATOR_SYMBOLS: Readonly<
  Record<WorkflowQualityGate['operator'], string>
> = {
  gte: '≥',
  lte: '≤',
  eq: '=',
};

// The share of inputs a preprocessing report kept, the usual condition to continue.
export const RETAINED_INPUT_RATIO_METRIC: PreprocessingSummaryMetricName =
  'preprocessing.retained_input_ratio';
// A new condition starts at a common threshold; each workflow can change it before saving.
const DEFAULT_MIN_RETAINED_INPUT_RATIO = 0.9;
// A new input counts once in the mix until someone weighs it.
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

/** A pinned dataset version as an input; '' until one is chosen. */
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

/** Training and fine-tuning read their inputs as training data; other kinds as plain input. */
export function defaultInputRole(
  task: Pick<ExperimentTask, 'kind'>,
): WorkflowDatasetBinding['role'] {
  return task.kind === 'training' || task.kind === 'finetuning' ? 'training' : 'input';
}

/** The task's own dataset versions as the step's inputs, used when a task is chosen. */
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

/**
 * Points the steps that took their model or an input from the step key `from` at `to`, after
 * that step's key changed. An empty key is not a rename: the references then show as missing.
 */
export function renameStepReferences(
  steps: WorkflowStepDraft[],
  { from, to }: { from: string; to: string },
): WorkflowStepDraft[] {
  if (!from || !to || from === to) return steps;
  return steps.map((step) => ({
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
  }));
}
