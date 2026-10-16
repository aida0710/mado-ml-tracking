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

// Bound the assembled search response across namespaces and dataset histories.
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
  /** Reads the access token's grant from Mado, then confirms every read the integration relies on. */
  checkConnection(): Promise<MadoConnectionCheck>;
  /** The grant as Mado reports it now; it can differ from the one saved at the last check. */
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
/** `null` stands for every namespace, which Mado searches in one request. */
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
  // Every operation reads the grant first, so a Mado without the endpoint fails with this reason.
  async function readAccessTokenGrant(): Promise<MadoAccessTokenGrant> {
    try {
      return await client.accessTokenGrant();
    } catch (error) {
      if (error instanceof MadoApiError && error.status === 404)
        throw new DomainError(
          502,
          'このMadoはアクセストークンの許可範囲の取得（/api/mado/access-token）に対応していません。Madoを更新してください',
          'plugin_mado_access_token_unsupported',
        );
      throw error;
    }
  }
  // Connection checks are deliberate, read-only requests even while the integration is disabled.
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
