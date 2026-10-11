import {
  CPU_ARCHES,
  type CpuArch,
  type ExecutionRuntimeKind,
  type TargetCheckResult,
} from '@mmt/contracts';
import type { FormField, FormValues, SuggestFieldValues } from '../types/form';
import { CheckboxList } from './CheckboxList';
import { FormFields } from './FormFields';
import { OptionPicker } from './OptionPicker';
import {
  detectedGpus,
  formGpuIds,
  toggleGpuId,
  withConcurrencyFollowingGpus,
} from '../lib/computerSetupValues';
import { getFieldValue, getSelectedValues, toggleValue } from '../lib/formValues';
import { EXECUTION_RUNTIME_KINDS } from '../lib/runtimeValidation';
import { cpuArchLabels } from '../i18n/compute';
import { runtimeLabels } from '../i18n/runtime';
import { text, textTemplates } from '../i18n/catalog';

const MAX_CONCURRENT_JOBS = 128;

function cpuArchHint(result: TargetCheckResult | null | undefined): string | undefined {
  if (result?.version !== 2 || !result.host.machine) return undefined;
  return result.host.cpuArch
    ? textTemplates.cpuArchDetected(result.host.machine)
    : textTemplates.cpuArchUnknown(result.host.machine);
}

/**
 * Step 2「接続後の設定」of an ssh or local computer: where its Jobs work and with which Python,
 * its CPU, runtimes and GPUs, how many Jobs at once, how datasets arrive, and whether it is on.
 * Paths complete from the check and from directories the worker reads; the check's GPUs are
 * offered as checkboxes and any ID may be typed (a login node submits to other machines).
 */
export function ComputerSetupFields({
  values,
  onChange,
  result,
  suggestWorkDirectory,
  suggestPython,
  suggestionsRefreshKey,
  concurrencyFollowsGpus,
  onConcurrencyEdited,
}: {
  values: FormValues;
  onChange: (values: FormValues) => void;
  /** The latest finished check, which the candidates come from; none before a check. */
  result: TargetCheckResult | null | undefined;
  suggestWorkDirectory: SuggestFieldValues;
  suggestPython: SuggestFieldValues;
  suggestionsRefreshKey: string;
  /** The number of Jobs at once still follows the chosen GPUs (nobody typed one yet). */
  concurrencyFollowsGpus: boolean;
  onConcurrencyEdited: () => void;
}) {
  const change = (next: FormValues) => {
    if (getFieldValue(next, 'maxConcurrentJobs') !== getFieldValue(values, 'maxConcurrentJobs'))
      onConcurrencyEdited();
    onChange(concurrencyFollowsGpus ? withConcurrencyFollowingGpus(values, next) : next);
  };
  const pathFields: FormField[] = [
    {
      name: 'workDirectory',
      label: text.workDirectory,
      required: true,
      suggest: suggestWorkDirectory,
      offerSuggestionsWhenEmpty: true,
      suggestionsRefreshKey,
      hint: text.workDirectoryHint,
    },
    {
      name: 'pythonExecutable',
      label: text.pythonExecutable,
      required: true,
      suggest: suggestPython,
      offerSuggestionsWhenEmpty: true,
      suggestionsRefreshKey,
      hint: text.pythonExecutableHint,
    },
  ];
  const gpus = detectedGpus(result);
  const gpuFields: FormField[] = [
    {
      name: 'gpuIds',
      label: text.gpuIdsPerLine,
      type: 'textarea',
      hint: text.gpuIdsManualHint,
    },
    {
      name: 'maxConcurrentJobs',
      label: text.maxConcurrentJobs,
      type: 'number',
      required: true,
      min: 1,
      max: MAX_CONCURRENT_JOBS,
      hint: text.maxConcurrentJobsHint,
    },
  ];
  const storageFields: FormField[] = [
    {
      name: 'datasetCacheMaxGiB',
      label: text.datasetCacheMaxGiB,
      type: 'number',
      required: true,
      min: 1,
    },
    { name: 'enabled', label: text.enabled, type: 'checkbox' },
  ];
  const selectedRuntimes = getSelectedValues(values, 'runtimeKinds') as ExecutionRuntimeKind[];
  return (
    <>
      <FormFields fields={pathFields} values={values} onChange={change} />
      <OptionPicker<CpuArch>
        name="target-cpu-arch"
        legend={text.cpuArch}
        options={CPU_ARCHES.map((arch) => ({ value: arch, label: cpuArchLabels[arch] }))}
        value={getFieldValue(values, 'cpuArch') as CpuArch}
        onChange={(cpuArch) => change({ ...values, cpuArch })}
        hint={cpuArchHint(result)}
      />
      <CheckboxList
        legend={text.runtimeKinds}
        options={EXECUTION_RUNTIME_KINDS.map((kind) => ({ value: kind, label: runtimeLabels[kind] }))}
        selected={selectedRuntimes}
        onToggle={(kind) =>
          change({
            ...values,
            runtimeKinds: toggleValue(selectedRuntimes, kind as ExecutionRuntimeKind),
          })
        }
        hint={result?.runtimeKinds.length ? text.runtimeKindsFromCheck : undefined}
      />
      {gpus.length > 0 && (
        <CheckboxList
          legend={text.detectedGpusLegend}
          options={gpus.map((gpu) => ({
            value: gpu.index,
            label: textTemplates.gpuOption(gpu.index, gpu.name, `${gpu.memoryTotalMiB} MiB`),
          }))}
          selected={formGpuIds(values)}
          onToggle={(gpuId) => change(toggleGpuId(values, gpuId))}
        />
      )}
      <FormFields fields={gpuFields} values={values} onChange={change} />
      <OptionPicker
        name="target-dataset-transfer"
        legend={text.datasetTransfer}
        options={[
          { value: 'relay', label: text.datasetTransferRelay },
          { value: 'direct', label: text.datasetTransferDirect },
        ]}
        value={getFieldValue(values, 'datasetTransfer') === 'direct' ? 'direct' : 'relay'}
        onChange={(datasetTransfer) => change({ ...values, datasetTransfer })}
      />
      <FormFields fields={storageFields} values={values} onChange={change} />
      <p className="field-hint">{text.enabledHint}</p>
    </>
  );
}
