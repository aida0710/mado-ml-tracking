import type { MadoPluginConfig, PluginManifest } from '@mmt/contracts';
import { createMadoClient, type MadoCredentials, type PluginClient } from '@mmt/platform';
import { mapMadoDatasetVersion } from './datasetMapping.js';
import { createOpenLineageEvent } from './openLineageEvent.js';

// Bound the assembled search response across namespaces and dataset histories.
const MAX_SEARCH_RESULTS = 1000;
export interface BuiltinPluginClient extends PluginClient {
  datasetVersion(externalId: string): Promise<import('@mmt/contracts').PluginDataset>;
  sendPayload(payload: string): Promise<void>;
}
export function madoManifest(hasMetrics: boolean): PluginManifest {
  return {
    id: 'mado',
    name: 'Mado',
    version: '1.0.0',
    protocolVersion: '1.0',
    capabilities: [
      'datasets:search',
      'lineage:publish',
      ...(hasMetrics ? ['storage:metrics'] : []),
    ],
  };
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
  return {
    // Connection checks are deliberate, read-only requests even while the integration is disabled.
    manifest: async () => {
      for (const namespace of config.namespaces) await client.catalog(namespace, '');
      if (credentials.metricsToken) await client.capacityMetrics();
      return madoManifest(Boolean(credentials.metricsToken));
    },
    searchDatasets: async (query) => {
      const items: import('@mmt/contracts').PluginDataset[] = [];
      for (const namespace of config.namespaces) {
        const catalog = await client.catalog(namespace, query);
        for (const summary of catalog.results) {
          if (!summary.datasetId || !summary.currentVersionId) continue;
          const dataset = await client.dataset(summary.datasetId);
          if (dataset.namespace !== namespace || dataset.name !== summary.name)
            throw new Error('Mado dataset identity differs');
          for (const version of dataset.versions) {
            if (
              !version.manifestUri &&
              !version.locations.some((location) => location.status === 'available')
            )
              continue;
            items.push(mapMadoDatasetVersion({ version, namespace, name: dataset.name }));
            if (items.length >= MAX_SEARCH_RESULTS) return { items };
          }
        }
      }
      return { items };
    },
    datasetVersion: async (externalId) => {
      const version = await client.version(externalId);
      return mapMadoDatasetVersion({ version, namespace: version.namespace, name: version.name });
    },
    metrics: async () => ({ prometheus: await client.capacityMetrics() }),
    sendEvent: (event) =>
      client.sendLineage(JSON.stringify(createOpenLineageEvent(event, { config, pluginId }))),
    sendPayload: client.sendLineage,
  };
}
