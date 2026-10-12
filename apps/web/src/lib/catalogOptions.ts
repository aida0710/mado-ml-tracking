import type { ExecutionCatalog } from '../types/executionCatalog';
import type { SelectOption } from '../types/form';
import { runtimeLabels } from '../i18n/runtime';
import { text } from '../i18n/catalog';
import { qualifiedDatasetVersionLabel } from './datasetVersionLabel';

/** How screens name a code version: "code name / version". */
export function formatCodeVersionName(codeName: string, version: string): string {
  return `${codeName} / ${version}`;
}

/** How screens name a model version: "model name / version". */
export function formatModelVersionName(modelName: string, version: string): string {
  return `${modelName} / ${version}`;
}

export function buildCatalogOptions(catalog: ExecutionCatalog) {
  return {
    experiments: catalog.experiments.map((item) => ({ value: item.id, label: item.name })),
    models: catalog.modelVersions.map((item) => ({
      value: item.id,
      label: `${formatModelVersionName(catalog.models.find((model) => model.id === item.modelId)?.name ?? item.modelId, item.version)} · ${item.family}`,
    })),
    codes: catalog.codeVersions.map((item) => ({
      value: item.id,
      label: `${formatCodeVersionName(catalog.codes.find((code) => code.id === item.codeId)?.name ?? item.codeId, item.version)} · ${runtimeLabels[item.runtime.kind]}`,
    })),
    datasets: catalog.datasetVersions.map((item) => ({
      value: item.id,
      label: qualifiedDatasetVersionLabel(item),
    })),
    runs: catalog.runs.map((item) => ({ value: item.id, label: item.name })),
  };
}
export const withEmptyOption = (options: SelectOption[]): SelectOption[] => [
  { value: '', label: text.none },
  ...options,
];
