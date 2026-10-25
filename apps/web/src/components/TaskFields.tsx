import { MAX_JOB_GPU_COUNT, type ComputeTarget, type RunKind } from '@mmt/contracts';
import type { ExecutionCatalog } from '../types/executionCatalog';
import type { FormField, FormValues } from '../types/form';
import { getFieldValue } from '../lib/formValues';
import { buildCatalogOptions, withEmptyOption } from '../lib/catalogOptions';
import { explainMissingCodeCandidates } from '../lib/codeCandidateReason';
import { isCodeCompatible, RUN_KINDS } from '../lib/executionValidation';
import { isTargetCompatible } from '../lib/runtimeValidation';
import { isSiteTarget } from '../lib/siteExecutionInput';
import { hasOutputModel } from '../lib/taskInput';
import { FormFields } from './FormFields';
import { MissingCodeNotice } from './MissingCodeNotice';
import { TaskOutputModelFields } from './TaskOutputModelFields';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

export function TaskFields({ values, catalog, targets, onChange, isEditing = false, launchOnly = false }: {
  values: FormValues; catalog: ExecutionCatalog; targets: ComputeTarget[];
  onChange: (values: FormValues) => void; isEditing?: boolean; launchOnly?: boolean;
}) {
  useLocale();
  const options = buildCatalogOptions(catalog);
  const kind = getFieldValue(values, 'kind') as RunKind;
  const model = catalog.modelVersions.find((item) => item.id === values.modelVersionId);
  const code = catalog.codeVersions.find((item) => item.id === values.codeVersionId);
  const target = targets.find((item) => item.id === values.targetId);
  const compatibleCodes = catalog.codeVersions.filter((item) => isCodeCompatible(item, kind, model));
  // siteはGPUの数と時間の上限を受け取り、ssh/localのコンピュータはGPUのIDを選択肢に出す。
  const isSite = isSiteTarget(target);
  const hasGpus = !isSite && (target?.gpuIds.length ?? 0) > 0;
  const fields: FormField[] = [
    { name: 'name', label: launchOnly ? text.runName : text.name, required: true },
    { name: 'description', label: text.description, type: 'textarea', visible: () => !launchOnly },
    { name: 'experimentId', label: text.experiments, type: 'select', required: true,
      options: withEmptyOption(options.experiments), visible: () => !isEditing && !launchOnly },
    { name: 'kind', label: text.kind, type: 'select', required: true,
      options: RUN_KINDS.map((value) => ({ value, label: text[value] })), visible: () => !launchOnly },
    { name: 'modelVersionId', label: text.modelVersion, type: 'select', options: withEmptyOption(options.models) },
    { name: 'codeVersionId', label: text.codeVersion, type: 'select', required: true,
      options: withEmptyOption(options.codes.filter((option) => compatibleCodes.some((item) => item.id === option.value))),
      visible: () => !launchOnly },
    { name: 'inputDatasetVersionIds', label: text.inputDatasets, type: 'checkboxes', options: options.datasets },
    { name: 'targetId', label: text.target, type: 'select', required: launchOnly,
      options: withEmptyOption(targets.filter((item) => code && isTargetCompatible(item, code)).map((item) => ({ value: item.id, label: item.name }))) },
    // GPUの無いコンピュータには、空の一覧の代わりに注記を出す（欄のまとまりの間に描く）。
    { name: 'gpuIds', label: text.gpuIds, type: 'checkboxes',
      options: target?.gpuIds.map((id) => ({ value: id, label: id })) ?? [], visible: () => hasGpus },
    { name: 'gpuCount', label: text.gpuCount, type: 'number', min: 0, max: MAX_JOB_GPU_COUNT,
      visible: () => isSite },
    { name: 'walltime', label: text.walltime, placeholder: text.walltimePlaceholder, visible: () => isSite },
    { name: 'parameters', label: launchOnly ? text.taskParameterOverrides : text.parametersJson, type: 'textarea' },
    { name: 'tags', label: text.tagsJson, type: 'textarea', visible: () => !launchOnly },
  ];
  // コードバージョンの一覧に候補が無いときに一覧の下で伝える文。空の一覧を行き止まりにしない。
  const missingCode = !launchOnly && !compatibleCodes.length
    ? explainMissingCodeCandidates({ codeVersions: catalog.codeVersions, taskType: kind || undefined, families: model ? [model.family] : [] })
    : null;
  const codeIndex = fields.findIndex((field) => field.name === 'codeVersionId') + 1;
  const gpuIndex = fields.findIndex((field) => field.name === 'gpuIds');
  return <>
    <FormFields fields={fields.slice(0, codeIndex)} values={values} onChange={onChange} />
    {missingCode && <MissingCodeNotice reason={missingCode} />}
    <FormFields fields={fields.slice(codeIndex, gpuIndex)} values={values} onChange={onChange} />
    {!hasGpus && !isSite && <div className="field">
      <span>{text.gpuIds}</span>
      <p className="muted field-note">{target ? text.gpuNoneOnTarget : text.gpuSelectTargetFirst}</p>
    </div>}
    <FormFields fields={fields.slice(gpuIndex)} values={values} onChange={onChange} />
    {!launchOnly && hasOutputModel(kind) &&
      <TaskOutputModelFields values={values} catalog={catalog} code={code} onChange={onChange} />}
  </>;
}
