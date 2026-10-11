import type {
  ExperimentTask,
  WorkflowDatasetBinding,
  WorkflowStep,
  WorkflowStepInput,
} from '@mmt/contracts';
import { workflowStepInputSchema } from '@mmt/contracts/schemas';
import { workflowsText } from '../i18n/workflows';

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

export function workflowStepDrafts(steps: WorkflowStep[]): WorkflowStepDraft[] {
  return steps.map(({ task, inputs, ...step }) => ({
    ...step,
    taskId: task.id,
    inputs: inputs.map((binding) => ({
      binding,
      selectionJson: JSON.stringify(binding.selection, null, 2),
    })),
  }));
}

export function pinWorkflowDrafts(
  steps: WorkflowStepDraft[],
  tasks: ExperimentTask[],
): WorkflowStepInput[] {
  try {
    return steps.map((step, index) => {
      const task = tasks.find((item) => item.id === step.taskId);
      if (!task) throw new Error();
      const earlier = steps.slice(0, index).map((item) => item.key);
      if (steps.slice(0, index).some((item) => item.key === step.key)) throw new Error();
      if (step.modelFromStepKey && !earlier.includes(step.modelFromStepKey)) throw new Error();
      const inputs = step.inputs.map(({ binding, selectionJson }) => {
        if (binding.source.kind === 'step' && !earlier.includes(binding.source.stepKey))
          throw new Error();
        return { ...binding, selection: JSON.parse(selectionJson) as unknown };
      });
      return workflowStepInputSchema.parse({
        ...step,
        inputs,
        expectedTaskRevision: task.revision,
      });
    });
  } catch {
    throw new Error(workflowsText.workflowInvalid);
  }
}
