import { MAX_JOB_ATTEMPTS } from '@mmt/contracts';
import type { AutomationCatalog, AutomationKind } from '../types/modelAutomation';
import type { FormField, FormValues } from '../types/form';
import { FormFields } from './FormFields';
import { CodeRuntimeDetails } from './CodeRuntimeDetails';
import { MissingCodeNotice } from './MissingCodeNotice';
import { getFieldValue, getSelectedValues } from '../lib/formValues';
import { buildCatalogOptions, withEmptyOption } from '../lib/catalogOptions';
import {
  AUTOMATION_KINDS,
  AUTOMATION_TRIGGERS,
  isAutomationCodeCompatible,
  upstreamRuleCandidates,
} from '../lib/modelAutomationInput';
import { explainMissingCodeCandidates } from '../lib/codeCandidateReason';
import { isTargetCompatible } from '../lib/runtimeValidation';
import { targetChoiceLabel } from '../lib/computeTargetDisplay';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { automationText, automationTriggerLabels } from '../i18n/automation';

export function AutomationRuleFields({
  values,
  catalog,
  onChange,
}: {
  values: FormValues;
  catalog: AutomationCatalog;
  onChange: (values: FormValues) => void;
}) {
  useLocale();
  const choices = catalog.registry;
  const options = buildCatalogOptions(choices);
  const modelFamilies = getSelectedValues(values, 'modelFamilies');
  const kind = getFieldValue(values, 'kind') as AutomationKind;
  const compatibleCodes = choices.codeVersions.filter((code) =>
    isAutomationCodeCompatible({ code, kind, modelFamilies }),
  );
  const code = compatibleCodes.find(
    (version) => version.id === getFieldValue(values, 'codeVersionId'),
  );
  const compatibleTargets = catalog.targets.filter(
    (target) => code && isTargetCompatible(target, code),
  );
  const target = compatibleTargets.find((item) => item.id === getFieldValue(values, 'targetId'));
  // Families already chosen stay listed (a copied rule's family no model uses any more).
  const families = [
    ...new Set([
      ...choices.models.map((model) => model.family),
      ...choices.codeVersions.flatMap((version) => version.supportedModelFamilies),
      ...modelFamilies,
    ]),
  ].sort();
  // Said under the code version list when it offers nothing, so an empty list is not a dead end.
  const missingCode = AUTOMATION_KINDS.includes(kind)
    ? explainMissingCodeCandidates({
        codeVersions: choices.codeVersions,
        taskType: kind,
        families: modelFamilies,
      })
    : null;
  const fields: FormField[] = [
    { name: 'name', label: text.name, required: true },
    {
      name: 'trigger',
      label: automationText.trigger,
      type: 'select',
      required: true,
      options: AUTOMATION_TRIGGERS.map((item) => ({
        value: item,
        label: automationTriggerLabels[item],
      })),
    },
    {
      name: 'upstreamRuleId',
      label: automationText.upstreamRule,
      type: 'select',
      required: true,
      visible: (current) => getFieldValue(current, 'trigger') === 'upstream_run_finished',
      options: withEmptyOption(
        upstreamRuleCandidates(catalog.rules).map((rule) => ({
          value: rule.id,
          label: `${rule.name} · ${text[rule.kind]}`,
        })),
      ),
    },
    {
      name: 'modelFamilies',
      label: text.automationModelFamilies,
      type: 'checkboxes',
      required: true,
      options: families.map((family) => ({ value: family, label: family })),
    },
    {
      name: 'kind',
      label: text.kind,
      type: 'select',
      required: true,
      options: AUTOMATION_KINDS.map((item) => ({ value: item, label: text[item] })),
    },
    {
      name: 'experimentId',
      label: text.experiments,
      type: 'select',
      required: true,
      options: withEmptyOption(options.experiments),
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
    },
    {
      name: 'targetId',
      label: text.target,
      type: 'select',
      required: true,
      options: withEmptyOption(
        compatibleTargets.map((item) => ({ value: item.id, label: targetChoiceLabel(item) })),
      ),
    },
    {
      name: 'gpuIds',
      label: text.gpuIds,
      type: 'checkboxes',
      options: (target?.gpuIds ?? []).map((id) => ({ value: id, label: id })),
      emptyText: target ? text.gpuNoneOnTarget : text.gpuSelectTargetFirst,
    },
    {
      name: 'inputDatasetVersionIds',
      label: text.inputDatasets,
      type: 'checkboxes',
      options: options.datasets,
    },
    { name: 'parameters', label: text.parametersJson, type: 'textarea' },
    { name: 'tags', label: text.tagsJson, type: 'textarea' },
    {
      name: 'maxAttempts',
      label: automationText.maxAttempts,
      type: 'number',
      required: true,
      min: 1,
      max: MAX_JOB_ATTEMPTS,
    },
    { name: 'enabled', label: text.enabled, type: 'checkbox' },
  ];
  const codeEnd = fields.findIndex((field) => field.name === 'codeVersionId') + 1;
  return (
    <>
      <FormFields fields={fields.slice(0, codeEnd)} values={values} onChange={onChange} />
      {missingCode && <MissingCodeNotice reason={missingCode} />}
      <FormFields fields={fields.slice(codeEnd)} values={values} onChange={onChange} />
      {code && <CodeRuntimeDetails version={code} />}
      {code && !compatibleTargets.length && <p className="notice">{text.noCompatibleTargets}</p>}
    </>
  );
}
