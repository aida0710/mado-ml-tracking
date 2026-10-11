import type { MadoPluginConfig, MadoPluginCredentialsInput } from '@mmt/contracts';
import type { BuiltinPluginClient } from '../src/plugins/mado/madoPlugin.js';

export const MADO_CONFIG_FIXTURE: MadoPluginConfig = {
  apiUrl: 'https://mado-api.example.test',
  webUrl: 'https://mado.example.test',
  lineageUrl: 'https://mado-lineage.example.test',
  namespaces: ['remote'],
  jobNamespace: 'mado-model-tracking',
  storageSystemKey: 'mado-model-tracking',
};

export const MADO_CREDENTIALS_FIXTURE: MadoPluginCredentialsInput = {
  readToken: 'fixture-mado-read-token',
  lineageToken: 'fixture-mado-lineage-token',
  metricsToken: null,
};

/** Existing Run tests explicitly enable delivery; omission in the public API still means disabled. */
export function madoPluginInput({
  name = 'Mado',
  enabled = true,
  config = {},
  credentials = MADO_CREDENTIALS_FIXTURE,
}: {
  name?: string;
  enabled?: boolean;
  config?: Partial<MadoPluginConfig>;
  credentials?: MadoPluginCredentialsInput;
} = {}) {
  return {
    kind: 'mado' as const,
    name,
    enabled,
    config: { ...MADO_CONFIG_FIXTURE, ...config },
    credentials,
  };
}

export function madoClientStub(overrides: Partial<BuiltinPluginClient> = {}): BuiltinPluginClient {
  return {
    manifest: async () => ({
      id: 'mado',
      name: 'Mado',
      version: '1.0.0',
      protocolVersion: '1.0',
      capabilities: ['datasets:search', 'lineage:publish'],
    }),
    metrics: async () => ({ prometheus: '' }),
    searchDatasets: async () => ({ items: [] }),
    datasetVersion: async () => {
      throw new Error('A fixed Mado version fixture is required');
    },
    sendEvent: async () => undefined,
    sendPayload: async () => undefined,
    ...overrides,
  };
}
