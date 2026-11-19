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
};

export const MADO_CREDENTIALS_FIXTURE: MadoPluginCredentialsInput = {
  accessToken: 'fixture-mado-access-token',
};

/** fixtureのtokenについてmado S3 Data Catalogが返す内容。capacityの読み取りは無し。 */
export const MADO_ACCESS_TOKEN_GRANT_FIXTURE: MadoAccessTokenGrant = {
  name: 'ML Tracking',
  scopes: [],
  expiresAt: null,
};

/** 既定で有効な接続を作る。公開APIでは、enabledを省略すれば無効の意味になる。 */
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
    metrics: async () => ({ prometheus: '' }),
    ...clientOverrides,
  };
}
