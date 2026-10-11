import { rows, type Connection } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { assertProjectReferences } from '../repositories/registryRepository.js';

// Saving a new reference to DatasetVersions (a Run's inputs, the inputs a Task, automation rule or
// hook starts Runs with, a version's parents) while versions may be deleted or Datasets archived.

interface LockedDataset {
  id: string;
  name: string;
  archivedAt: string | null;
}

/**
 * Keeps the DatasetVersions this transaction is about to refer to from being deleted before it
 * commits, and checks again that they exist. DatasetVersionDeletionService locks the version's
 * Dataset FOR UPDATE before it counts references, so the two take turns on the Dataset row: a
 * deletion that comes second counts the new reference and answers 409, and one that committed
 * first leaves the version missing, which the check after the lock answers with 404.
 *
 * `numberingDatasetId` is a Dataset this transaction numbers a new version in, which needs the
 * Dataset to itself; every Dataset is then locked FOR UPDATE. Either way one statement takes the
 * locks in id order, so two transactions that lock each other's Datasets cannot deadlock.
 */
export async function lockDatasetsOfVersions(
  connection: Connection,
  reference: { projectId: string; versionIds: string[]; numberingDatasetId?: string },
): Promise<LockedDataset[]> {
  const { projectId, versionIds, numberingDatasetId } = reference;
  if (!versionIds.length && !numberingDatasetId) return [];
  const lockMode = numberingDatasetId ? 'FOR UPDATE' : 'FOR SHARE';
  const datasets = await rows<LockedDataset>(
    connection,
    `SELECT d.id,d.name,d.archived_at FROM datasets d
    WHERE d.project_id=$1
      AND (d.id=$3 OR d.id IN (SELECT dataset_id FROM dataset_versions WHERE project_id=$1 AND id=ANY($2::uuid[])))
    ORDER BY d.id ${lockMode} OF d`,
    [projectId, versionIds, numberingDatasetId ?? null],
  );
  // A version deleted while this waited for a lock is gone now.
  await assertProjectReferences(connection, { table: 'dataset_versions', projectId, ids: versionIds });
  return datasets;
}

/**
 * Refuses archived Datasets, and versions deleted meanwhile, as inputs of a new Run or of what
 * starts Runs later (Task, automation rule, hook). Existing Runs and Jobs keep their references;
 * only saving a new reference calls this.
 */
export async function assertInputDatasetVersionsUsable(
  connection: Connection,
  reference: { projectId: string; ids: string[] },
): Promise<void> {
  // Every input Dataset is locked, not only archived ones, so an archive cannot slip in before
  // commit (RegistryService.updateDataset updates the same row).
  const datasets = await lockDatasetsOfVersions(connection, {
    projectId: reference.projectId,
    versionIds: reference.ids,
  });
  const archivedNames = datasets
    .filter((dataset) => dataset.archivedAt)
    .map((dataset) => dataset.name);
  if (archivedNames.length)
    throw new DomainError(
      422,
      `archive済みDatasetのバージョンは新しいRunの入力に使えません: ${archivedNames.join(', ')}`,
      'dataset_archived',
    );
}
