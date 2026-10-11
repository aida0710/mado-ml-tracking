import {
  DEFAULT_JOB_ATTEMPTS,
  type CodeVersion,
  type ComputeTarget,
  type ModelVersion,
  type Run,
  type RunKind,
} from '@mmt/contracts';
import type { CreateRun } from '../api/inputs';
import type { FormValues } from '../types/form';
import { isCodeCompatible } from './executionValidation';
import {
  getFieldValue,
  getSelectedValues,
  parseJsonObject,
  parseStringMap,
} from './formValues';
import { applyLaunchFormChange, type ClearedLaunchChoice } from './launchFormChanges';
import { isTargetCompatible } from './runtimeValidation';

/** What the launch form chooses from: the Project's code and model versions and its computers. */
export interface LaunchCandidates<Target extends ComputeTarget> {
  codeVersions: readonly CodeVersion[];
  modelVersions: readonly ModelVersion[];
  targets: readonly Target[];
}

/** What the form's values choose, and which code versions and computers fit those choices. */
export interface LaunchChoices<Target extends ComputeTarget> {
  kind: RunKind;
  model: ModelVersion | undefined;
  /** The code versions that run the chosen kind and model version. */
  compatibleCodes: CodeVersion[];
  /** How many code versions the form leaves out because they do not. */
  hiddenCodeCount: number;
  selectedCode: CodeVersion | undefined;
  target: Target | undefined;
  /** The computers with the chosen code version's runtime; none until a code is chosen. */
  compatibleTargets: Target[];
}

/** The form for a new Run, or for the Job of an existing queued Run (its settings filled in). */
export function initialLaunchValues(existingRun: Run | undefined): FormValues {
  return {
    name: existingRun?.name ?? '',
    experimentId: existingRun?.experimentId ?? '',
    kind: existingRun?.kind ?? 'inference',
    modelVersionId: existingRun?.modelVersionId ?? '',
    codeVersionId: existingRun?.codeVersionId ?? '',
    inputDatasetVersionIds: existingRun?.inputDatasetVersionIds ?? [],
    parameters: JSON.stringify(existingRun?.parameters ?? {}, null, 2),
    tags: JSON.stringify(existingRun?.tags ?? {}, null, 2),
    environment: JSON.stringify(existingRun?.environment ?? {}, null, 2),
    targetId: '',
    gpuIds: [],
    gpuCount: '0',
    walltime: '',
    maxAttempts: String(DEFAULT_JOB_ATTEMPTS),
    retryOnFailure: 'false',
    retryOnTimeout: 'false',
    allowChildJobs: 'false',
  };
}

function findChosen<Item extends { id: string }>(
  items: readonly Item[],
  values: FormValues,
  field: string,
): Item | undefined {
  return items.find((item) => item.id === getFieldValue(values, field));
}

export function launchChoices<Target extends ComputeTarget>(
  values: FormValues,
  candidates: LaunchCandidates<Target>,
): LaunchChoices<Target> {
  const kind = getFieldValue(values, 'kind') as RunKind;
  const model = findChosen(candidates.modelVersions, values, 'modelVersionId');
  const compatibleCodes = candidates.codeVersions.filter((version) =>
    isCodeCompatible(version, kind, model),
  );
  const selectedCode = findChosen(compatibleCodes, values, 'codeVersionId');
  return {
    kind,
    model,
    compatibleCodes,
    hiddenCodeCount: candidates.codeVersions.length - compatibleCodes.length,
    selectedCode,
    target: findChosen(candidates.targets, values, 'targetId'),
    compatibleTargets: selectedCode
      ? candidates.targets.filter((item) => isTargetCompatible(item, selectedCode))
      : [],
  };
}

/**
 * Applies an edit of the form. A code version that no longer runs the chosen kind and model, or a
 * computer that lacks the chosen code's runtime, is dropped (applyLaunchFormChange says which).
 */
export function changeLaunchValues<Target extends ComputeTarget>({
  previous,
  next,
  candidates,
}: {
  previous: FormValues;
  next: FormValues;
  candidates: LaunchCandidates<Target>;
}): { values: FormValues; cleared: ClearedLaunchChoice[] } {
  return applyLaunchFormChange({
    previous,
    next,
    isCodeAllowed: (values) => Boolean(launchChoices(values, candidates).selectedCode),
    isTargetAllowed: (values) => {
      const code = findChosen(candidates.codeVersions, values, 'codeVersionId');
      const target = findChosen(candidates.targets, values, 'targetId');
      return Boolean(code && target && isTargetCompatible(target, code));
    },
  });
}

/**
 * The Run the form describes. Throws the parse error of a JSON field that is not an object (or,
 * for tags, not a map of strings), so the setup step can stop there.
 */
export function launchRunInput(values: FormValues): CreateRun {
  return {
    name: getFieldValue(values, 'name'),
    experimentId: getFieldValue(values, 'experimentId'),
    kind: getFieldValue(values, 'kind') as RunKind,
    modelVersionId: getFieldValue(values, 'modelVersionId') || undefined,
    codeVersionId: getFieldValue(values, 'codeVersionId'),
    inputDatasetVersionIds: getSelectedValues(values, 'inputDatasetVersionIds'),
    parameters: parseJsonObject(getFieldValue(values, 'parameters')),
    tags: parseStringMap(getFieldValue(values, 'tags')),
    environment: parseJsonObject(getFieldValue(values, 'environment')),
  };
}
