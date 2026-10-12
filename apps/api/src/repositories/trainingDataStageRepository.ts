import type { TrainingDataStage } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';

export const trainingDatasetVersionIdsColumn = `ARRAY(
  SELECT DISTINCT input_id FROM (
    SELECT unnest(runs.input_dataset_version_ids) AS input_id
    UNION ALL SELECT unnest(s.input_dataset_version_ids) FROM training_data_stages s
      WHERE s.run_id=runs.id AND s.project_id=runs.project_id
  ) inputs ORDER BY input_id) AS training_dataset_version_ids`;

export async function listTrainingDataStages(
  connection: Connection,
  reference: { projectId: string; runId: string },
): Promise<TrainingDataStage[]> {
  return rows(
    connection,
    `SELECT id,project_id,run_id,start_step::float8 AS start_step,
    input_dataset_version_ids,checkpoint_id,metadata,created_by,created_at FROM training_data_stages
    WHERE project_id=$1 AND run_id=$2 ORDER BY start_step,id`,
    [reference.projectId, reference.runId],
  );
}
