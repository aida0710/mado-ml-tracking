import type { PluginDataset } from '@mmt/contracts';
import type { MadoVersion } from '@mmt/platform';
import { DomainError } from '../../domain/errors.js';

export function mapMadoDatasetVersion({
  version,
  namespace,
  name,
}: {
  version: MadoVersion;
  namespace: string;
  name: string;
}): PluginDataset {
  const available = version.locations.filter((location) => location.status === 'available');
  const uri =
    (available.find((location) => location.isPrimary) ?? available[0])?.uri ?? version.manifestUri;
  if (!uri)
    throw new DomainError({
      status: 422,
      code: 'plugin_dataset_unavailable',
      message: 'this Mado version has no storage that can be used',
    });
  return {
    externalId: version.id,
    namespace,
    name,
    version: version.version,
    uri,
    digest: version.contentHash ?? version.manifestHash ?? `mado-version:${version.id}`,
    schema: {},
    metadata: {
      madoDatasetId: version.datasetId,
      madoVersionId: version.id,
      ...(version.schemaUri ? { schemaUri: version.schemaUri } : {}),
    },
  };
}
