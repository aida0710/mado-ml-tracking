import { isSameUuid, type MadoPluginConfig, type DatasetVersion, type PluginEvent } from '@mmt/contracts';

// Keep the producer and property order stable for the legacy delivery ledger.
// Bound the error facet while preserving the bridge's existing truncation.
const MAX_ERROR_MESSAGE_LENGTH = 4096;
const EVENT_TYPES = {
  'run.started': 'START',
  'run.finished': 'COMPLETE',
  'run.failed': 'FAIL',
  'run.canceled': 'ABORT',
} as const;
// An external identity is only usable at the connection that imported it.
function datasetReference(
  dataset: DatasetVersion,
  projectId: string,
  options: {
    config: Pick<MadoPluginConfig, 'jobNamespace' | 'storageSystemKey'>;
    pluginId?: string;
  },
) {
  const { config, pluginId } = options;
  // Local names are unique within a Project; imported Mado identities remain unchanged.
  const externalRef =
    dataset.externalRef && (!pluginId || isSameUuid(pluginId, dataset.externalRef.pluginId))
      ? dataset.externalRef
      : null;
  const reference = externalRef ?? {
    namespace: config.jobNamespace,
    name: `${projectId}/${encodeURIComponent(dataset.namespace)}/${encodeURIComponent(dataset.name)}`,
    version: dataset.version,
  };
  const facets: Record<string, unknown> = {
    version: { datasetVersion: reference.version },
  };
  if (!externalRef) {
    const location = getStorageLocation(dataset.uri, config.storageSystemKey);
    facets.datasetRegistry = {
      ...(dataset.digest.startsWith('sha256:') ? { contentHash: dataset.digest } : {}),
      ...(location ? { storageLocations: [location] } : {}),
    };
  }
  return { namespace: reference.namespace, name: reference.name, facets };
}

function getStorageLocation(value: string, systemKey: string) {
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    // Native references also accept local paths. An unavailable location must not abort a Run transition.
    return null;
  }
  return {
    systemKey,
    kind: uri.protocol === 's3:' ? 's3' : 'filesystem',
    uri: value,
    ...(uri.protocol === 's3:' ? { bucket: uri.hostname } : {}),
    isPrimary: true,
  };
}
export function createOpenLineageEvent(
  event: PluginEvent,
  options: {
    config: Pick<MadoPluginConfig, 'jobNamespace' | 'storageSystemKey'>;
    pluginId?: string;
  },
) {
  const { config } = options;
  return {
    eventType: EVENT_TYPES[event.type],
    eventTime: event.timestamp,
    run: {
      runId: event.run.id,
      facets: {
        datasetRegistry: {
          runtime: {
            kind: event.run.kind,
            codeVersionId: event.run.codeVersionId,
          },
          metrics: event.run.latestMetrics,
          modelRefs: event.run.modelVersionId ? [{ versionId: event.run.modelVersionId }] : [],
          ...(event.run.error
            ? { errorMessage: event.run.error.slice(0, MAX_ERROR_MESSAGE_LENGTH) }
            : {}),
        },
      },
    },
    job: {
      namespace: config.jobNamespace,
      name: event.run.codeVersionId ?? event.run.name,
      facets: {},
    },
    inputs: event.inputDatasets.map((dataset) =>
      datasetReference(dataset, event.projectId, options),
    ),
    outputs: event.outputDatasets.map((dataset) =>
      datasetReference(dataset, event.projectId, options),
    ),
    producer: 'urn:mado-model-tracking:plugin:mado',
    schemaURL: 'https://openlineage.io/spec/2-0-2/OpenLineage.json',
  };
}
