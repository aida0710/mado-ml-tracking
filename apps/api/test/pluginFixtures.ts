import type {
  MadoAccessTokenGrant,
  MadoPluginConfig,
  MadoPluginCredentialsInput,
} from '@mmt/contracts';
import {
  madoManifest,
  type BuiltinPluginClient,
} from '../src/plugins/mado/madoPlugin.js';

export const MADO_CONFIG_FIXTURE: MadoPluginConfig = {
  apiUrl: 'https://mado-api.example.test',
  webUrl: 'https://mado.example.test',
  lineageUrl: 'https://mado-lineage.example.test',
  jobNamespace: 'mado-model-tracking',
  storageSystemKey: 'mado-model-tracking',
};

export const MADO_CREDENTIALS_FIXTURE: MadoPluginCredentialsInput = {
  accessToken: 'fixture-mado-access-token',
};

/** What Mado reports for the fixture token: reading and sending in two namespaces, no capacity. */
export const MADO_ACCESS_TOKEN_GRANT_FIXTURE: MadoAccessTokenGrant = {
  name: 'ML Tracking',
  scopes: ['lineage:read', 'lineage:write'],
  namespaces: ['mado-model-tracking', 'remote'],
  expiresAt: null,
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

export function madoClientStub(
  overrides: Partial<BuiltinPluginClient> & { grant?: MadoAccessTokenGrant } = {},
): BuiltinPluginClient {
  const { grant = MADO_ACCESS_TOKEN_GRANT_FIXTURE, ...clientOverrides } = overrides;
  return {
    checkConnection: async () => ({ manifest: madoManifest(grant), accessTokenGrant: grant }),
    accessTokenGrant: async () => grant,
    manifest: async () => madoManifest(grant),
    metrics: async () => ({ prometheus: '' }),
    searchDatasets: async () => ({ items: [] }),
    datasetVersion: async () => {
      throw new Error('A fixed Mado version fixture is required');
    },
    sendEvent: async () => undefined,
    sendPayload: async () => undefined,
    ...clientOverrides,
  };
}
