import { isSameUuid, type Dataset, type DatasetVersion, type PluginDataset } from '@mmt/contracts';
import type { Connection } from '../db/database.js';
import { first } from '../db/database.js';
import { conflict } from '../domain/errors.js';
import { datasetVersionSelect } from '../repositories/registryRepository.js';
import type { RegistryService } from './registryService.js';

export async function importPluginDataset(
  connection: Connection,
  registry: RegistryService,
  request: {
    projectId: string;
    pluginId: string;
    dataset: PluginDataset;
  },
): Promise<DatasetVersion> {
  const { projectId, pluginId, dataset: imported } = request;
  // Serialize first-time creation and imports across versions of the same remote dataset.
  await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    JSON.stringify([projectId, imported.namespace, imported.name]),
  ]);
  let dataset = await first<Dataset>(
    connection,
    'SELECT * FROM datasets WHERE project_id=$1 AND namespace=$2 AND name=$3',
    [projectId, imported.namespace, imported.name],
  );
  dataset ??= (await first<Dataset>(
    connection,
    'INSERT INTO datasets(project_id,name,namespace,description) VALUES($1,$2,$3,$4) RETURNING *',
    [projectId, imported.name, imported.namespace, '連携から取り込んだデータセット'],
  ))!;
  const existing = await first<DatasetVersion>(
    connection,
    `${datasetVersionSelect} WHERE v.dataset_id=$1 AND v.version=$2`,
    [dataset.id, imported.version],
  );
  if (existing) {
    if (
      !existing.externalRef ||
      !isSameUuid(pluginId, existing.externalRef.pluginId) ||
      !isSameUuid(imported.externalId, existing.externalRef.externalId) ||
      existing.digest !== imported.digest ||
      existing.uri !== imported.uri
    )
      conflict('既存のDatasetVersionと連携先のバージョンが一致しません');
    return existing;
  }
  return registry.insertDatasetVersion(connection, projectId, {
    datasetId: dataset.id,
    input: {
      ...imported,
      sourceRunId: null,
      parentDatasetVersionIds: [],
      externalRef: {
        pluginId,
        externalId: imported.externalId,
        namespace: imported.namespace,
        name: imported.name,
        version: imported.version,
      },
    },
  });
}
