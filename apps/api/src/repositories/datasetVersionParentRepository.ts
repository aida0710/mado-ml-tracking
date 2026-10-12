import type { DatasetVersionParentAddition, DatasetVersionParentPage } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { notFound } from '../domain/errors.js';

export interface DatasetVersionParentLocation {
  projectId: string;
  datasetId: string;
  versionId: string;
}

// Registration order is preserved; additions follow in a deterministic order without duplicates.
export const datasetVersionParentIdsColumn = `v.parent_dataset_version_ids || ARRAY(
  SELECT a.parent_dataset_version_id FROM dataset_version_parent_additions a
  WHERE a.project_id=v.project_id AND a.dataset_version_id=v.id
    AND NOT a.parent_dataset_version_id=ANY(v.parent_dataset_version_ids)
  ORDER BY a.created_at,a.parent_dataset_version_id) AS parent_dataset_version_ids`;

export async function findDatasetVersionParents(
  connection: Connection,
  location: DatasetVersionParentLocation,
): Promise<DatasetVersionParentPage> {
  const registration = await first<{ parentDatasetVersionIds: string[] }>(
    connection,
    'SELECT parent_dataset_version_ids FROM dataset_versions WHERE project_id=$1 AND dataset_id=$2 AND id=$3',
    [location.projectId, location.datasetId, location.versionId],
  );
  if (!registration) notFound('DatasetVersion');
  const additions = await rows<DatasetVersionParentAddition>(
    connection,
    `SELECT a.*,u.display_name AS created_by_name FROM dataset_version_parent_additions a
    JOIN users u ON u.id=a.created_by WHERE a.project_id=$1 AND a.dataset_version_id=$2
    ORDER BY a.created_at,a.parent_dataset_version_id`,
    [location.projectId, location.versionId],
  );
  return {
    registeredParentDatasetVersionIds: registration.parentDatasetVersionIds,
    parentDatasetVersionIds: [
      ...new Set([
        ...registration.parentDatasetVersionIds,
        ...additions.map((addition) => addition.parentDatasetVersionId),
      ]),
    ],
    items: additions,
  };
}
