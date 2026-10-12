import { trainingDatasetVersionIdsColumn } from './trainingDataStageRepository.js';

// Output models include appended training sources; deleting a version needs no second write.
// MLflow soft-deleted versions (including deleted registered models) are excluded.
export const outputModelVersionIdsColumn = `ARRAY(
  SELECT v.id FROM model_versions v
  LEFT JOIN mlflow_model_version_metadata vm ON vm.version_id=v.id
  WHERE v.project_id=runs.project_id AND (v.source_run_id=runs.id OR EXISTS (
    SELECT 1 FROM model_version_training_sources s WHERE s.model_version_id=v.id AND s.run_id=runs.id))
    AND vm.deleted_at IS NULL
  ORDER BY v.created_at,v.id) AS output_model_version_ids`;

// The screens show who created a Run by name; the id alone means nothing to a reader.
export const createdByNameColumn = `(SELECT u.display_name FROM users u WHERE u.id=runs.created_by)
  AS created_by_name`;

// Every statement that returns a whole Run (SELECT or RETURNING) uses this so the field is never missing.
export const runColumns = `*,${outputModelVersionIdsColumn},${trainingDatasetVersionIdsColumn},${createdByNameColumn}`;

// Polling lists retain execution identity; code text and code environment belong to detail reads.
export const runSummarySelect = `SELECT
  id,project_id,experiment_id,name,kind,status,parameters,tags,latest_metrics,
  model_version_id,code_version_id,input_dataset_version_ids,upstream_dataset_version_ids,
  output_dataset_version_ids,
  ${outputModelVersionIdsColumn},
  ${trainingDatasetVersionIdsColumn},
  parent_run_id,environment,created_by,${createdByNameColumn},created_at,started_at,ended_at,error,
  lifecycle_stage,mlflow_managed,mlflow_user_id,recorded_parameters,
  task_id,task_revision,execution_mode,resume_checkpoint_id
  FROM runs`;
