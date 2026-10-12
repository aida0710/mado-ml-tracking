import type { MadoPluginConfig, MadoPluginCredentialsInput, PluginConnection } from '@mmt/contracts';
import type { FormValues } from '../types/form';
import { getFieldValue } from './formValues';

// Stable defaults identify the tracking app in Mado's jobs and storage locations.
const DEFAULT_MADO_JOB_NAMESPACE = 'mado-model-tracking';
const DEFAULT_MADO_STORAGE_SYSTEM_KEY = 'mado-model-tracking';

export function getMadoPluginFormValues(plugin: PluginConnection | null): FormValues {
  const config = plugin?.config;
  return {
    name: plugin?.name ?? 'Mado',
    apiUrl: config?.apiUrl ?? '',
    webUrl: config?.webUrl ?? '',
    lineageUrl: config?.lineageUrl ?? '',
    namespaces: config?.namespaces.join('\n') ?? '',
    jobNamespace: config?.jobNamespace ?? DEFAULT_MADO_JOB_NAMESPACE,
    storageSystemKey: config?.storageSystemKey ?? DEFAULT_MADO_STORAGE_SYSTEM_KEY,
    readToken: '',
    lineageToken: '',
    metricsToken: '',
    removeMetricsToken: 'false',
  };
}

export function getMadoPluginConfig(values: FormValues): MadoPluginConfig {
  const apiUrl = getFieldValue(values, 'apiUrl').trim();
  return {
    apiUrl,
    webUrl: getFieldValue(values, 'webUrl').trim(),
    lineageUrl: getFieldValue(values, 'lineageUrl').trim() || apiUrl,
    namespaces: [...new Set(getFieldValue(values, 'namespaces').split(/[\n,]/).map((name) => name.trim()).filter(Boolean))],
    jobNamespace: getFieldValue(values, 'jobNamespace').trim(),
    storageSystemKey: getFieldValue(values, 'storageSystemKey').trim(),
  };
}

export function getMadoPluginCredentials(values: FormValues): MadoPluginCredentialsInput | undefined {
  const credentials: MadoPluginCredentialsInput = {};
  for (const name of ['readToken', 'lineageToken', 'metricsToken'] as const) {
    const token = getFieldValue(values, name);
    if (token) credentials[name] = token;
  }
  if (values.removeMetricsToken === 'true') credentials.metricsToken = null;
  return Object.keys(credentials).length ? credentials : undefined;
}
