import type { Connection } from '../db/database.js';

/** purgeでの1つのテーブルの担当分。その中のどの行がpurgeするProject（$1）のものか。 */
export interface ProjectPurgeStep {
  table: string;
  rowsOfProject: string;
}

const BY_PROJECT_ID = 'project_id=$1';

function byParent(column: string, parentTable: string): string {
  return `${column} IN (SELECT id FROM ${parentTable} WHERE project_id=$1)`;
}

/**
 * Projectの行を持つすべてのテーブルを削除の順に並べる。project_id列の無いテーブルは親を通して
 * 行を見つけるので、親より前に置く。それ以外はどの順でもよい。purgeは外部キーの検査をコミット
 * まで遅らせるため（migration 055）。それでも、ON DELETEの動作が子に触れずに済むよう、子は親より
 * 前に並べる。purgeするテーブルを参照するテーブルが抜けていると、
 * project-purge.integration.test.tsが失敗する。
 */
export const PROJECT_PURGE_STEPS: readonly ProjectPurgeStep[] = [
  { table: 'metrics', rowsOfProject: byParent('run_id', 'runs') },
  { table: 'run_logs', rowsOfProject: byParent('run_id', 'runs') },
  { table: 'model_aliases', rowsOfProject: byParent('model_id', 'models') },
  { table: 'gpu_reservations', rowsOfProject: byParent('job_id', 'jobs') },
  { table: 'plugin_outbox', rowsOfProject: byParent('plugin_id', 'plugin_connections') },
  { table: 'report_block_snapshots', rowsOfProject: byParent('report_id', 'reports') },
  { table: 'report_revisions', rowsOfProject: byParent('report_id', 'reports') },
  // artifact_upload_partsはartifact_uploadsと一緒に消える（ON DELETE CASCADE）。
  ...[
    'comments',
    'preprocessing_report_samples',
    'preprocessing_reports',
    'workflow_step_runs',
    'workflow_executions',
    'workflow_version_inputs',
    'workflow_versions',
    'workflows',
    'saved_views',
    'reports',
    'notification_outbox',
    'notification_rules',
    'notification_channels',
    'operations_alerts',
    'workers',
    'project_group_bindings',
    'project_members',
    'demo_seed_history',
    'plugin_connections',
    'run_media',
    'artifact_media_info',
    'artifact_previews',
    'mlflow_artifact_paths',
    'artifact_deletions',
    'artifact_uploads',
    'mlflow_logged_model_metrics',
    'mlflow_model_version_metadata',
    'mlflow_registered_model_metadata',
    'mlflow_run_dataset_inputs',
    'mlflow_run_model_inputs',
    'mlflow_run_model_outputs',
    'mlflow_datasets',
    'mlflow_logged_models',
    'model_promotion_evaluations',
    'model_alias_events',
    'model_promotion_policies',
    'model_alias_protections',
    'model_automation_events',
    'model_automation_executions',
    'hook_executions',
    'sweep_trials',
    'sweeps',
    'job_tokens',
    'jobs',
    'job_array_groups',
    'hooks',
    'model_automation_rules',
    'run_output_declarations',
    'run_output_registrations',
    'run_resume_events',
    'run_sync_batches',
    'dataset_version_parent_additions',
    'lineage_relation_additions',
    'model_version_training_sources',
    'training_data_stages',
    'run_checkpoints',
    'dataset_version_files',
    'runs',
    'experiment_tasks',
    'model_versions',
    'models',
    'dataset_versions',
    'datasets',
    'code_versions',
    'codes',
    'artifacts',
    'experiments',
  ].map((table) => ({ table, rowsOfProject: BY_PROJECT_ID })),
];

/**
 * project_idを持つが、purgeしたProjectの行を残すテーブルとその理由。利用者は決して削除しない。
 * 監査イベントと、それが操作者として指すAPI tokenは、起きたことの記録になる。
 */
export const PROJECT_PURGE_KEPT_TABLES: Readonly<Record<string, string>> = {
  projects: 'the tombstone row (name only) that the kept rows below point at',
  audit_events: 'audit events are kept forever',
  api_tokens: 'audit events name tokens as actors; the purge revokes them',
  users: 'Service Accounts are users, which are never deleted; the purge disables them',
  service_account_details: 'details of the disabled Service Accounts',
  purged_project_blobs: 'the blobs the garbage collector still has to remove',
};

/**
 * ProjectのArtifactとアップロードセッションのblobを、ガベージコレクタが既に消したものを除いて
 * キューに入れる。セッションのキーには、Artifactを登録する前にfinalizerが書いたblobがあるかも
 * しれない。blobの無いキーを消しても成功する。
 */
async function queueProjectBlobs(connection: Connection, projectId: string): Promise<number> {
  const queued = await connection.query(
    `INSERT INTO purged_project_blobs(backend,storage_key,project_id)
    SELECT a.backend,a.storage_key,a.project_id FROM artifacts a
    WHERE a.project_id=$1 AND NOT EXISTS(
      SELECT 1 FROM artifact_deletions d WHERE d.artifact_id=a.id AND d.blob_removed_at IS NOT NULL)
    UNION
    SELECT u.backend,u.storage_key,u.project_id FROM artifact_uploads u WHERE u.project_id=$1
    ON CONFLICT DO NOTHING`,
    [projectId],
  );
  return queued.rowCount ?? 0;
}

// 残す行は使えなくする。tokenは失効させ、Service Accountは無効にする。
async function retireKeptIdentities(connection: Connection, projectId: string): Promise<void> {
  await connection.query(
    'UPDATE api_tokens SET revoked_at=now() WHERE project_id=$1 AND revoked_at IS NULL',
    [projectId],
  );
  await connection.query(
    "UPDATE users SET status='disabled' WHERE kind='service' AND service_project_id=$1",
    [projectId],
  );
  await connection.query(
    'UPDATE service_account_details SET disabled_at=COALESCE(disabled_at,now()) WHERE project_id=$1',
    [projectId],
  );
}

/**
 * このトランザクションでprojectsの行を既にpurge済みにしたProjectの行をすべて削除する（それは
 * migration 055の履歴のトリガーが確かめる）。キューに入れた数と削除した数を返す。
 */
export async function purgeProjectRows(
  connection: Connection,
  projectId: string,
): Promise<{ queuedBlobs: number; deletedRows: number }> {
  await connection.query('SET CONSTRAINTS ALL DEFERRED');
  const queuedBlobs = await queueProjectBlobs(connection, projectId);
  await retireKeptIdentities(connection, projectId);
  let deletedRows = 0;
  for (const step of PROJECT_PURGE_STEPS) {
    // テーブル名と条件はこのモジュールの定数で、リクエストの入力ではない。
    const deleted = await connection.query(
      `DELETE FROM ${step.table} WHERE ${step.rowsOfProject}`,
      [projectId],
    );
    deletedRows += deleted.rowCount ?? 0;
  }
  return { queuedBlobs, deletedRows };
}
