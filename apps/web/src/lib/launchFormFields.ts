import { MAX_JOB_ATTEMPTS, MAX_JOB_GPU_COUNT, type ComputeTarget } from '@mmt/contracts';
import type { FormField } from '../types/form';
import { withEmptyOption, type buildCatalogOptions } from './catalogOptions';
import { targetChoiceLabel } from './computeTargetDisplay';
import { RUN_KINDS } from './executionValidation';
import type { LaunchChoices } from './launchFormValues';
import { isSiteTarget } from './siteExecutionInput';
import { isWorkerMissing, type WorkerCoverage } from './workerCoverage';
import { workerCoverageLabel } from './workerCoverageDisplay';
import { text } from '../i18n/catalog';
import { jobsTextTemplates } from '../i18n/jobs';
import { workerCoverageTextTemplates } from '../i18n/workerCoverage';

/** The first step: what to run (the Run's settings). */
export function launchSetupFields<Target extends ComputeTarget>({
  options,
  choices,
}: {
  options: ReturnType<typeof buildCatalogOptions>;
  choices: LaunchChoices<Target>;
}): FormField[] {
  const { compatibleCodes, hiddenCodeCount, kind } = choices;
  return [
    { name: 'name', label: text.runName, required: true },
    {
      name: 'experimentId',
      label: text.experiments,
      type: 'select',
      required: true,
      options: withEmptyOption(options.experiments),
    },
    {
      name: 'kind',
      label: text.kind,
      type: 'select',
      required: true,
      options: RUN_KINDS.map((item) => ({ value: item, label: text[item] })),
    },
    {
      name: 'modelVersionId',
      label: text.modelVersion,
      type: 'select',
      options: withEmptyOption(options.models),
    },
    {
      name: 'codeVersionId',
      label: text.codeVersion,
      type: 'select',
      required: true,
      options: withEmptyOption(
        options.codes.filter((option) =>
          compatibleCodes.some((version) => version.id === option.value),
        ),
      ),
      // Codes for other kinds are not offered; say so, or a training code seems lost.
      hint:
        hiddenCodeCount > 0
          ? jobsTextTemplates.launchCodesHidden(text[kind], hiddenCodeCount)
          : undefined,
    },
    {
      name: 'inputDatasetVersionIds',
      label: text.inputDatasets,
      type: 'checkboxes',
      options: options.datasets,
    },
    { name: 'parameters', label: `${text.parameters} (JSON)`, type: 'textarea' },
    { name: 'tags', label: `${text.tags} (JSON)`, type: 'textarea' },
    { name: 'environment', label: `${text.environment} (JSON)`, type: 'textarea' },
  ];
}

/** A computer in the select, marked when no worker of the Project takes its Jobs. */
function targetChoiceWithWorkers(label: string, coverage: WorkerCoverage | undefined): string {
  return coverage && isWorkerMissing(coverage)
    ? workerCoverageTextTemplates.targetChoiceWorkerMissing(label, workerCoverageLabel(coverage))
    : label;
}

/**
 * The second step: where and with what it runs. A site takes a GPU count, a time limit and
 * automatic retries instead of GPU IDs.
 */
export function launchResourceFields<Target extends ComputeTarget>({
  choices,
  coverageOf,
}: {
  choices: LaunchChoices<Target>;
  /** Which workers take a computer's Jobs; undefined until the workers are read. */
  coverageOf: (target: Target) => WorkerCoverage | undefined;
}): FormField[] {
  const { target, compatibleTargets } = choices;
  const isSite = isSiteTarget(target);
  return [
    {
      name: 'targetId',
      label: text.target,
      type: 'select',
      required: true,
      options: withEmptyOption(
        compatibleTargets.map((item) => ({
          value: item.id,
          label: targetChoiceWithWorkers(targetChoiceLabel(item), coverageOf(item)),
        })),
      ),
    },
    {
      name: 'gpuIds',
      label: text.launchGpuChoice,
      type: 'checkboxes',
      options: (target?.gpuIds ?? []).map((id) => ({ value: id, label: id })),
      emptyText: text.gpuNoneOnTarget,
      // Until a computer is chosen there are no GPUs to offer.
      visible: () => Boolean(target) && !isSite,
    },
    {
      name: 'gpuCount',
      label: text.gpuCount,
      type: 'number',
      min: 0,
      max: MAX_JOB_GPU_COUNT,
      visible: () => isSite,
    },
    {
      name: 'walltime',
      label: text.walltime,
      placeholder: text.walltimePlaceholder,
      visible: () => isSite,
    },
    {
      name: 'maxAttempts',
      label: text.maxAttempts,
      type: 'number',
      min: 1,
      max: MAX_JOB_ATTEMPTS,
      required: true,
      hint: text.maxAttemptsHint,
    },
    {
      name: 'retryOnFailure',
      label: text.jobRetryOnFailure,
      type: 'checkbox',
      visible: () => isSite,
    },
    {
      name: 'retryOnTimeout',
      label: text.jobRetryOnTimeout,
      type: 'checkbox',
      visible: () => isSite,
    },
    { name: 'allowChildJobs', label: text.jobAllowChildJobs, type: 'checkbox' },
  ];
}
