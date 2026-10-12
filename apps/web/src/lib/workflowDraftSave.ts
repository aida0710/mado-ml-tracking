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
 * What a workflow draft becomes when it is saved, or the first reason it cannot be, checked here
 * before the API checks it again.
 */

/** Describes a problem in the language shown when it is read. */
type DescribeProblem = () => string;

const SUMMARY_METRIC_NAMES: ReadonlySet<string> = new Set(PREPROCESSING_SUMMARY_METRIC_NAMES);

/** What keeps the step itself (not its inputs or conditions) from being saved. */
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

/** What keeps one input from being saved. */
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
 * What keeps one quality condition from being saved. A preprocessing.* name must be one the
 * report computes; any other name is the code's own metric.
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
 * The first reason the draft cannot be saved, naming the step (and its input or quality
 * condition) by its position from 1, or null. A step refers only to the steps before it.
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
 * The steps to save, each with the current revision of its task (the version pins it). Throws a
 * LocalizedError that names the step and the field to fix.
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
    // Limits the checks above do not repeat (lengths, counts) still name the step.
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
