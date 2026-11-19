import type { MadoPluginConfig, MadoPluginCredentialsInput, PluginConnection } from '@mmt/contracts';
import type { FormValues } from '../types/form';
import { getFieldValue } from './formValues';

export function getMadoPluginFormValues(plugin: PluginConnection | null): FormValues {
  const config = plugin?.config;
  return {
    name: plugin?.name ?? 'Mado',
    apiUrl: config?.apiUrl ?? '',
    webUrl: config?.webUrl ?? '',
    accessToken: '',
  };
}

export function getMadoPluginConfig(values: FormValues): MadoPluginConfig {
  return {
    apiUrl: getFieldValue(values, 'apiUrl').trim(),
    webUrl: getFieldValue(values, 'webUrl').trim(),
  };
}

/** tokenの項目が空なら保存済みのtokenをそのまま使うので、tokenは何も送らない。 */
export function getMadoPluginCredentials(values: FormValues): MadoPluginCredentialsInput | undefined {
  const accessToken = getFieldValue(values, 'accessToken');
  return accessToken ? { accessToken } : undefined;
}
