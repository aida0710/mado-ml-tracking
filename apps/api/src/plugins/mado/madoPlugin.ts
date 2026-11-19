import {
  MADO_SCOPES,
  type MadoAccessTokenGrant,
  type MadoPluginConfig,
  type PluginManifest,
} from '@mmt/contracts';
import { createMadoClient, MadoApiError, type MadoCredentials } from '@mmt/platform';
import { DomainError } from '../../domain/errors.js';

export interface MadoConnectionCheck {
  manifest: PluginManifest;
  accessTokenGrant: MadoAccessTokenGrant;
}
export interface BuiltinPluginClient {
  metrics(): Promise<{ prometheus: string }>;
  /** access tokenのgrantをmado S3 Data Catalogから読み、許されていれば容量も読めることを確かめる。 */
  checkConnection(): Promise<MadoConnectionCheck>;
}
export function madoManifest(grant: MadoAccessTokenGrant): PluginManifest {
  return {
    id: 'mado',
    name: 'Mado',
    version: '1.0.0',
    protocolVersion: '1.0',
    capabilities: grant.scopes.includes(MADO_SCOPES.metricsRead) ? ['storage:metrics'] : [],
  };
}
export function createMadoPlugin({
  config,
  credentials,
  fetcher,
}: {
  config: MadoPluginConfig;
  credentials: MadoCredentials;
  fetcher?: typeof fetch;
}): BuiltinPluginClient {
  const client = createMadoClient({ config, credentials, fetcher });
  async function readAccessTokenGrant(): Promise<MadoAccessTokenGrant> {
    try {
      return await client.accessTokenGrant();
    } catch (error) {
      if (error instanceof MadoApiError && error.status === 404)
        throw new DomainError({
          status: 502,
          code: 'plugin_mado_access_token_unsupported',
          message: 'this Mado cannot report the permissions of its access token (/api/mado/access-token); update Mado',
        });
      throw error;
    }
  }
  return {
    // 接続の確認は、連携を無効にしている間でも、利用者が意図して行う読み取りだけのリクエスト。
    checkConnection: async () => {
      const grant = await readAccessTokenGrant();
      if (grant.scopes.includes(MADO_SCOPES.metricsRead)) await client.capacityMetrics();
      return { manifest: madoManifest(grant), accessTokenGrant: grant };
    },
    metrics: async () => ({ prometheus: await client.capacityMetrics() }),
  };
}
