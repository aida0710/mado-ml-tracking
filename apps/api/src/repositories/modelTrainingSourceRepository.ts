import type { ModelVersionTrainingSource } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';

export interface ModelTrainingSourceLocation {
  projectId: string;
  modelId: string;
  versionId: string;
}

export const modelTrainingSourceRunIdColumn = `COALESCE(v.source_run_id,
  (SELECT s.run_id FROM model_version_training_sources s WHERE s.model_version_id=v.id))
  AS training_source_run_id`;

export async function findModelTrainingSource(
  connection: Connection,
  location: ModelTrainingSourceLocation,
): Promise<ModelVersionTrainingSource | null> {
  return (
    (await first<ModelVersionTrainingSource>(
      connection,
      `SELECT v.project_id,v.model_id,
    v.id AS model_version_id,COALESCE(v.source_run_id,s.run_id) AS run_id,
    CASE WHEN v.source_run_id IS NOT NULL THEN 'registration' ELSE 'association' END AS origin,
    CASE WHEN v.source_run_id IS NOT NULL THEN '{}'::jsonb ELSE s.evidence END AS evidence,
    CASE WHEN v.source_run_id IS NOT NULL THEN NULL ELSE s.created_by END AS created_by,
    CASE WHEN v.source_run_id IS NOT NULL THEN v.created_at ELSE s.created_at END AS created_at
    FROM model_versions v LEFT JOIN model_version_training_sources s ON s.model_version_id=v.id
    WHERE v.project_id=$1 AND v.model_id=$2 AND v.id=$3
    AND (v.source_run_id IS NOT NULL OR s.run_id IS NOT NULL)`,
      [location.projectId, location.modelId, location.versionId],
    )) ?? null
  );
}

/** Serializes new provenance edges so concurrent associations cannot jointly create a cycle. */
export async function lockProjectTrainingSources(
  connection: Connection,
  projectId: string,
): Promise<void> {
  await connection.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('model-training-source:'||$1||':'||current_schema(),0))",
    [projectId],
  );
}

/** Checks an ancestor across the pinned Run, dataset and model lineage. */
export async function hasLineageAncestor(
  connection: Connection,
  reference: { projectId: string; ancestorId: string; descendantIds: string[] },
): Promise<boolean> {
  const ancestorMatch = await first<{ exists: boolean }>(
    connection,
    `WITH RECURSIVE
    lineage_edges(source,target) AS (
      SELECT unnest(input_dataset_version_ids),id FROM runs WHERE project_id=$1
      UNION ALL SELECT unnest(input_dataset_version_ids),run_id FROM training_data_stages WHERE project_id=$1
      UNION ALL SELECT model_version_id,id FROM runs WHERE project_id=$1 AND model_version_id IS NOT NULL
      UNION ALL SELECT parent_run_id,id FROM runs WHERE project_id=$1 AND parent_run_id IS NOT NULL
      UNION ALL SELECT unnest(parent_model_version_ids),id FROM model_versions WHERE project_id=$1
      UNION ALL SELECT source_run_id,id FROM model_versions WHERE project_id=$1 AND source_run_id IS NOT NULL
      UNION ALL SELECT run_id,model_version_id FROM model_version_training_sources WHERE project_id=$1
      UNION ALL SELECT unnest(parent_dataset_version_ids),id FROM dataset_versions WHERE project_id=$1
      UNION ALL SELECT source_run_id,id FROM dataset_versions WHERE project_id=$1 AND source_run_id IS NOT NULL
    ), ancestors(id) AS (
      SELECT source FROM lineage_edges WHERE target=ANY($3::uuid[])
      UNION SELECT edge.source FROM lineage_edges edge JOIN ancestors ON edge.target=ancestors.id
    ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=$2)`,
    [reference.projectId, reference.ancestorId, reference.descendantIds],
  );
  return ancestorMatch!.exists;
}
