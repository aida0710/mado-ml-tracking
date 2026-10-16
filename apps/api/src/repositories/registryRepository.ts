import type { CodeVersion, DatasetVersion, ModelVersion, Run } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { conflict, notFound } from '../domain/errors.js';
import { datasetVersionParentIdsColumn } from './datasetVersionParentRepository.js';
import { modelTrainingSourceRunIdColumn } from './modelTrainingSourceRepository.js';
import { runColumns } from './runListProjection.js';

// models.next_version is the numbering counter (modelVersionNumbering.ts). Models show it as
// nextVersion, so the version form can tell which number a version without one will get.
export const modelColumns =
  'id,project_id,name,family,description,next_version::text AS next_version,created_at';
export const modelSelect = `SELECT m.id,m.project_id,m.name,m.family,m.description,m.created_at,
  m.next_version::text AS next_version,
  (SELECT version FROM model_versions v WHERE v.model_id=m.id ORDER BY created_at DESC,id DESC LIMIT 1) AS latest_version,
  (SELECT COALESCE(jsonb_object_agg(alias,version_id::text),'{}'::jsonb) FROM model_aliases WHERE model_id=m.id) AS aliases FROM models m`;
export const codeSelect = `SELECT c.*, (SELECT version FROM code_versions v WHERE v.code_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) AS latest_version FROM codes c`;
export const datasetSelect = `SELECT d.*, (SELECT version FROM dataset_versions v WHERE v.dataset_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1) AS latest_version FROM datasets d`;
export const modelVersionSelect =
  `SELECT v.*,m.family,${modelTrainingSourceRunIdColumn} FROM model_versions v JOIN models m ON m.id=v.model_id`;
export const datasetVersionSelect =
  `SELECT v.*,d.name,d.namespace,${datasetVersionParentIdsColumn},
   COALESCE(v.source_run_id,(SELECT source_id FROM lineage_relation_additions
     WHERE project_id=v.project_id AND target_id=v.id AND relation='output')) AS source_run_id
   FROM dataset_versions v JOIN datasets d ON d.id=v.dataset_id`;

type ReferenceTable =
  | 'experiments'
  | 'runs'
  | 'models'
  | 'codes'
  | 'datasets'
  | 'model_versions'
  | 'code_versions'
  | 'dataset_versions'
  | 'artifacts'
  | 'plugin_connections';

export async function lockActiveExperiment(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<void> {
  const experiment = await first<{ lifecycleStage: string }>(
    connection,
    'SELECT lifecycle_stage FROM experiments WHERE project_id=$1 AND id=$2 FOR SHARE',
    [reference.projectId, reference.id],
  );
  if (!experiment) notFound('Experiment');
  if (experiment.lifecycleStage !== 'active') conflict('削除済みExperimentは変更・実行できません');
}

/**
 * Returns the stored ID, which is the lowercase form of a UUID however the URL spelled it, so a
 * caller that builds stored text from the ID (a path prefix) matches what was stored.
 */
export async function assertProjectReference(
  connection: Connection,
  reference: { table: ReferenceTable; projectId: string; id: string },
): Promise<string> {
  const entity = await first<{ id: string }>(
    connection,
    `SELECT id FROM ${reference.table} WHERE id=$1 AND project_id=$2`,
    [reference.id, reference.projectId],
  );
  if (!entity) notFound(reference.table);
  return entity.id;
}

export async function assertProjectReferences(
  connection: Connection,
  reference: { table: ReferenceTable; projectId: string; ids: string[] },
): Promise<void> {
  if (!reference.ids.length) return;
  const entities = await rows<{ id: string }>(
    connection,
    `SELECT id FROM ${reference.table} WHERE project_id=$1 AND id=ANY($2::uuid[])`,
    [reference.projectId, reference.ids],
  );
  if (new Set(entities.map((entity) => entity.id)).size !== new Set(reference.ids).size)
    notFound(reference.table);
}

export async function findCodeVersion(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<CodeVersion> {
  const version = await first<CodeVersion>(
    connection,
    'SELECT * FROM code_versions WHERE project_id=$1 AND id=$2',
    [reference.projectId, reference.id],
  );
  if (!version) notFound('CodeVersion');
  return version;
}

export async function findModelVersion(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<ModelVersion> {
  const version = await first<ModelVersion>(
    connection,
    `${modelVersionSelect} WHERE v.project_id=$1 AND v.id=$2`,
    [reference.projectId, reference.id],
  );
  if (!version) notFound('ModelVersion');
  return version;
}

export async function findDatasetVersions(
  connection: Connection,
  reference: { projectId: string; ids: string[] },
): Promise<DatasetVersion[]> {
  const versions = await rows<DatasetVersion>(
    connection,
    `${datasetVersionSelect} WHERE v.project_id=$1 AND v.id=ANY($2::uuid[])`,
    [reference.projectId, reference.ids],
  );
  if (versions.length !== new Set(reference.ids).size) notFound('DatasetVersion');
  const versionsById = new Map(versions.map((version) => [version.id, version]));
  return reference.ids.map((id) => versionsById.get(id)!);
}

export async function findRun(
  connection: Connection,
  reference: { projectId: string; id: string; lock?: boolean },
): Promise<Run> {
  const run = await first<Run>(
    connection,
    `SELECT ${runColumns} FROM runs WHERE project_id=$1 AND id=$2 ${reference.lock ? 'FOR UPDATE' : ''}`,
    [reference.projectId, reference.id],
  );
  if (!run) notFound('Run');
  return run;
}
