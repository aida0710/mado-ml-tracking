import { first, type Connection } from '../db/database.js';
import type { DatasetVersionReferenceCounts } from '../domain/datasetVersionUsage.js';

// What deleting a DatasetVersion reads and writes (DatasetVersionDeletionService).

/** How many of each kind refer to the version, all within its Project. */
export async function countDatasetVersionReferences(
  connection: Connection,
  version: { projectId: string; id: string },
): Promise<DatasetVersionReferenceCounts> {
  return (await first<DatasetVersionReferenceCounts>(
    connection,
    `SELECT
      (SELECT count(*)::int FROM runs WHERE project_id=$1 AND $2::uuid=ANY(input_dataset_version_ids)) AS run_input,
      (SELECT count(*)::int FROM runs WHERE project_id=$1 AND $2::uuid=ANY(output_dataset_version_ids)) AS run_output,
      (SELECT count(*)::int FROM dataset_versions WHERE project_id=$1 AND $2::uuid=ANY(parent_dataset_version_ids)) AS child_version,
      (SELECT count(*)::int FROM experiment_tasks WHERE project_id=$1 AND $2::uuid=ANY(input_dataset_version_ids)) AS task,
      (SELECT count(*)::int FROM model_automation_rules WHERE project_id=$1 AND $2::uuid=ANY(input_dataset_version_ids)) AS automation_rule,
      (SELECT count(*)::int FROM hooks WHERE project_id=$1 AND template->'inputDatasetVersionIds' ? $2::text) AS hook,
      (SELECT count(*)::int FROM jobs WHERE project_id=$1 AND dataset_partition_version_id=$2) AS job_partition,
      (SELECT count(*)::int FROM run_output_declarations WHERE project_id=$1 AND dataset_version_id=$2) AS output_declaration,
      ((SELECT count(*)::int FROM mlflow_datasets WHERE project_id=$1 AND dataset_version_id=$2)
        + (SELECT count(*)::int FROM mlflow_run_dataset_inputs WHERE project_id=$1 AND dataset_version_id=$2)) AS mlflow_dataset`,
    [version.projectId, version.id],
  ))!;
}

/** Removes the version and its file list; the caller has checked that nothing refers to it. */
export async function deleteDatasetVersionWithFiles(
  connection: Connection,
  version: { projectId: string; id: string },
): Promise<void> {
  await connection.query('DELETE FROM dataset_version_files WHERE project_id=$1 AND dataset_version_id=$2', [
    version.projectId,
    version.id,
  ]);
  await connection.query('DELETE FROM dataset_versions WHERE project_id=$1 AND id=$2', [
    version.projectId,
    version.id,
  ]);
}
