import {
  allowsAllMadoNamespaces,
  MADO_SCOPES,
  type MadoAccessTokenGrant,
  type MadoPluginConfig,
  type PluginDataset,
  type PluginManifest,
  type PluginEvent,
} from '@mmt/contracts';
import {
  createMadoClient,
  MadoApiError,
  type MadoCredentials,
} from '@mmt/platform';
import { DomainError } from '../../domain/errors.js';
import { assertAccessTokenCoversConnection } from './accessTokenRequirements.js';
import { mapMadoDatasetVersion } from './datasetMapping.js';
import { createOpenLineageEvent } from './openLineageEvent.js';

// 名前空間とデータセットの履歴をまたいで組み立てた検索の応答の大きさを抑える。
const MAX_SEARCH_RESULTS = 1000;
export interface MadoConnectionCheck {
  manifest: PluginManifest;
  accessTokenGrant: MadoAccessTokenGrant;
}
export interface BuiltinPluginClient {
  manifest(): Promise<PluginManifest>;
  searchDatasets(query: string): Promise<{ items: PluginDataset[] }>;
  metrics(): Promise<{ prometheus: string }>;
  sendEvent(event: PluginEvent): Promise<void>;
  /** access tokenのgrantをmado S3 Data Catalogから読み、連携に要る読み取りをすべて確かめる。 */
  checkConnection(): Promise<MadoConnectionCheck>;
  /** mado S3 Data Catalogが今返すgrant。前回の確認で保存したものと違うことがある。 */
  accessTokenGrant(): Promise<MadoAccessTokenGrant>;
  datasetVersion(externalId: string): Promise<PluginDataset>;
  sendPayload(payload: string): Promise<void>;
}
export function madoManifest(grant: MadoAccessTokenGrant): PluginManifest {
  return {
    id: 'mado',
    name: 'Mado',
    version: '1.0.0',
    protocolVersion: '1.0',
    capabilities: [
      'datasets:search',
      'lineage:publish',
      ...(grant.scopes.includes(MADO_SCOPES.metricsRead) ? ['storage:metrics'] : []),
    ],
  };
}
/** `null`はすべての名前空間を表し、mado S3 Data Catalogは1回のリクエストで検索する。 */
function searchedNamespaces(grant: MadoAccessTokenGrant): (string | null)[] {
  return allowsAllMadoNamespaces(grant) ? [null] : grant.namespaces;
}
export function createMadoPlugin({
  config,
  credentials,
  pluginId,
  fetcher,
}: {
  config: MadoPluginConfig;
  credentials: MadoCredentials;
  pluginId?: string;
  fetcher?: typeof fetch;
}): BuiltinPluginClient {
  const client = createMadoClient({ config, credentials, fetcher });
  // どの操作も最初にgrantを読むので、そのエンドポイントの無いmado S3 Data Catalogではこの理由で
  // 失敗する。
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
  // 接続の確認は、連携を無効にしている間でも、利用者が意図して行う読み取りだけのリクエスト。
  async function checkConnection(): Promise<MadoConnectionCheck> {
    const grant = await readAccessTokenGrant();
    assertAccessTokenCoversConnection(grant, config);
    for (const namespace of searchedNamespaces(grant)) await client.catalog(namespace, '');
    if (grant.scopes.includes(MADO_SCOPES.metricsRead)) await client.capacityMetrics();
    return { manifest: madoManifest(grant), accessTokenGrant: grant };
  }
  return {
    checkConnection,
    accessTokenGrant: readAccessTokenGrant,
    manifest: async () => (await checkConnection()).manifest,
    searchDatasets: async (query) => {
      const items: PluginDataset[] = [];
      for (const namespace of searchedNamespaces(await readAccessTokenGrant())) {
        const catalog = await client.catalog(namespace, query);
        for (const summary of catalog.results) {
          if (!summary.datasetId || !summary.currentVersionId) continue;
          const dataset = await client.dataset(summary.datasetId);
          if (dataset.namespace !== summary.namespace || dataset.name !== summary.name)
            throw new Error('Mado dataset identity differs');
          for (const version of dataset.versions) {
            if (
              !version.manifestUri &&
              !version.locations.some((location) => location.status === 'available')
            )
              continue;
            items.push(
              mapMadoDatasetVersion({ version, namespace: dataset.namespace, name: dataset.name }),
            );
            if (items.length >= MAX_SEARCH_RESULTS) return { items };
          }
        }
      }
      return { items };
    },
    datasetVersion: async (externalId) => {
      await readAccessTokenGrant();
      const version = await client.version(externalId);
      return mapMadoDatasetVersion({ version, namespace: version.namespace, name: version.name });
    },
    metrics: async () => ({ prometheus: await client.capacityMetrics() }),
    sendEvent: (event) =>
      client.sendLineage(JSON.stringify(createOpenLineageEvent(event, { config, pluginId }))),
    sendPayload: client.sendLineage,
  };
}
