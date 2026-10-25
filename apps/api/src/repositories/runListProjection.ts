import { trainingDatasetVersionIdsColumn } from './trainingDataStageRepository.js';

// 出力のモデルには後から足した学習元も含める。バージョンを消しても、ほかを書き直す必要は無い。
// MLflowで論理削除したバージョン（削除した登録モデルのものを含む）は除く。
export const outputModelVersionIdsColumn = `ARRAY(
  SELECT v.id FROM model_versions v
  LEFT JOIN mlflow_model_version_metadata vm ON vm.version_id=v.id
  WHERE v.project_id=runs.project_id AND (v.source_run_id=runs.id OR EXISTS (
    SELECT 1 FROM model_version_training_sources s WHERE s.model_version_id=v.id AND s.run_id=runs.id))
    AND vm.deleted_at IS NULL
  ORDER BY v.created_at,v.id) AS output_model_version_ids`;

// 画面ではRunの作成者を名前で見せる。idだけでは読む人に何も伝わらない。
export const createdByNameColumn = `(SELECT u.display_name FROM users u WHERE u.id=runs.created_by)
  AS created_by_name`;

export const outputDatasetVersionIdsColumn = `(runs.output_dataset_version_ids || ARRAY(
  SELECT target_id FROM lineage_relation_additions
    WHERE project_id=runs.project_id AND source_id=runs.id AND relation='output'
      AND NOT target_id=ANY(runs.output_dataset_version_ids)
    ORDER BY created_at,id
)) AS output_dataset_version_ids`;

// Run全体を返す文（SELECTかRETURNING）はどれもこれを使い、フィールドが欠けないようにする。
export const runColumns = `*,${outputModelVersionIdsColumn},${outputDatasetVersionIdsColumn},${trainingDatasetVersionIdsColumn},${createdByNameColumn}`;

// ポーリングの一覧は実行を見分ける情報を残す。コードの本文とコードの環境は詳細の読み取りで返す。
export const runSummarySelect = `SELECT
  id,project_id,experiment_id,name,kind,status,parameters,tags,latest_metrics,
  model_version_id,code_version_id,input_dataset_version_ids,upstream_dataset_version_ids,
  ${outputDatasetVersionIdsColumn},
  ${outputModelVersionIdsColumn},
  ${trainingDatasetVersionIdsColumn},
  parent_run_id,environment,created_by,${createdByNameColumn},created_at,started_at,ended_at,error,
  lifecycle_stage,mlflow_managed,mlflow_user_id,recorded_parameters,
  task_id,task_revision,execution_mode,resume_checkpoint_id
  FROM runs`;
