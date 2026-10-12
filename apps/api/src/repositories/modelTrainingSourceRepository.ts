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
