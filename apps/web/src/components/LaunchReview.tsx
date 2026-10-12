import type { ReactNode } from 'react';
import type { ComputeTarget } from '@mmt/contracts';
import { DetailsList } from './JsonDetails';
import type { buildCatalogOptions } from '../lib/catalogOptions';
import { getFieldValue, getSelectedValues } from '../lib/formValues';
import { formatAutoRetries } from '../lib/jobDisplay';
import type { LaunchChoices } from '../lib/launchFormValues';
import { isSiteTarget } from '../lib/siteExecutionInput';
import type { FormValues } from '../types/form';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { jobsTextTemplates } from '../i18n/jobs';

/** The resources the review lists: GPU IDs, or a site's GPU count, time limit and retries. */
function reviewResources(values: FormValues, isSite: boolean): Array<[string, ReactNode]> {
  if (!isSite)
    return [[text.gpuIds, getSelectedValues(values, 'gpuIds').join(', ') || text.cpuOnly]];
  const retries = formatAutoRetries({
    retryOnFailure: getFieldValue(values, 'retryOnFailure') === 'true',
    retryOnTimeout: getFieldValue(values, 'retryOnTimeout') === 'true',
  });
  return [
    [text.gpuCount, jobsTextTemplates.gpuCount(Number(getFieldValue(values, 'gpuCount') || 0))],
    [text.walltimeShort, getFieldValue(values, 'walltime').trim() || text.walltimeUnset],
    [text.jobAutoRetry, retries],
  ];
}

/** The launch form's last step: what will start, by the names the earlier steps showed. */
export function LaunchReview<Target extends ComputeTarget>({
  values,
  choices,
  options,
}: {
  values: FormValues;
  choices: LaunchChoices<Target>;
  options: ReturnType<typeof buildCatalogOptions>;
}) {
  useLocale();
  const chosenDatasets = getSelectedValues(values, 'inputDatasetVersionIds');
  return (
    <DetailsList
      entries={[
        [text.runName, getFieldValue(values, 'name')],
        [text.kind, text[choices.kind]],
        [
          text.modelVersion,
          options.models.find((option) => option.value === choices.model?.id)?.label,
        ],
        [
          text.codeVersion,
          options.codes.find((option) => option.value === getFieldValue(values, 'codeVersionId'))
            ?.label,
        ],
        [
          text.inputDatasets,
          options.datasets
            .filter((option) => chosenDatasets.includes(option.value))
            .map((option) => option.label)
            .join(', '),
        ],
        [text.target, choices.target?.name],
        ...reviewResources(values, isSiteTarget(choices.target)),
        [text.maxAttempts, getFieldValue(values, 'maxAttempts')],
      ]}
    />
  );
}
