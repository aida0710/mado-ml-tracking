import { first, type Connection } from '../db/database.js';

/** 新しい来歴の辺を直列に追加し、同時の関連付けが合わさって循環を作らないようにする。 */
export async function lockProjectLineage(connection: Connection, projectId: string): Promise<void> {
  await connection.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('model-training-source:'||$1||':'||current_schema(),0))",
    [projectId],
  );
}

/** 固定したRun・データセット・モデルのlineageをまたいで祖先を確かめる。 */
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
      UNION ALL SELECT parent_dataset_version_id,dataset_version_id FROM dataset_version_parent_additions WHERE project_id=$1
      UNION ALL SELECT source_run_id,id FROM dataset_versions WHERE project_id=$1 AND source_run_id IS NOT NULL
      UNION ALL SELECT source_id,target_id FROM lineage_relation_additions WHERE project_id=$1 AND relation<>'reference'
    ), ancestors(id) AS (
      SELECT source FROM lineage_edges WHERE target=ANY($3::uuid[])
      UNION SELECT edge.source FROM lineage_edges edge JOIN ancestors ON edge.target=ancestors.id
    ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=$2)`,
    [reference.projectId, reference.ancestorId, reference.descendantIds],
  );
  return ancestorMatch!.exists;
}
