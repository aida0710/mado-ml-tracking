import type { ArtifactReferences } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';

/** Artifactの中身を生かしておく記録。1つでもある間はArtifactを削除できない。 */
export type ArtifactReferenceKind =
  | 'model_version'
  | 'code_version'
  | 'dataset_version'
  | 'checkpoint'
  | 'preprocessing_report';

/**
 * 参照の種類ごとのSQLの条件。`artifact`という別名を付けたartifactsの行に対して使う。登録した
 * モデルバージョンは、Artifactを直接指すか、変更できないMLflowのmanifestを通して指す。
 * checkpointは、残している間かRunがそこから続いている間はファイルを守る。隠したcheckpoint
 * （retained=false）は守らないので、古いcheckpointのファイルは削除できるようになる。
 */
function referenceConditions(artifact: string): Record<ArtifactReferenceKind, string> {
  return {
    model_version: `EXISTS(SELECT 1 FROM model_versions version
      WHERE version.project_id=${artifact}.project_id AND (version.artifact_id=${artifact}.id
        OR version.metadata #> '{mlflow,artifactManifest}'
           @> jsonb_build_array(jsonb_build_object('artifactId',${artifact}.id::text))))`,
    code_version: `EXISTS(SELECT 1 FROM code_versions code
      WHERE code.project_id=${artifact}.project_id
        AND (code.source->>'artifactId'=${artifact}.id::text
          OR code.runtime->>'artifactId'=${artifact}.id::text))`,
    dataset_version: `EXISTS(SELECT 1 FROM dataset_version_files file
      WHERE file.artifact_id=${artifact}.id)`,
    checkpoint: `EXISTS(SELECT 1 FROM run_checkpoints checkpoint
      WHERE checkpoint.project_id=${artifact}.project_id
        AND checkpoint.artifact_ids @> ARRAY[${artifact}.id]
        AND (checkpoint.retained OR EXISTS(SELECT 1 FROM runs resumed
          WHERE resumed.resume_checkpoint_id=checkpoint.id)))`,
    preprocessing_report: `EXISTS(SELECT 1 FROM preprocessing_report_samples sample
      WHERE sample.project_id=${artifact}.project_id AND sample.artifact_id=${artifact}.id)`,
  };
}

/** 別名`artifact`のArtifactを生かしているものが何も無いときに真になるSQLの条件。 */
export function unreferencedArtifactCondition(artifact: string): string {
  return `NOT (${Object.values(referenceConditions(artifact)).join(' OR ')})`;
}

/**
 * 渡した削除されていないArtifactそれぞれについて、参照の種類ごとの元の記録を名前付きで返す
 * （参照の無いArtifactは空の一覧）。どのクエリもreferenceConditionsが数えるものと一致させて
 * いるので、ここで未使用と出したファイルは、削除を求めれば受け付けられる。
 */
export async function listArtifactReferences(
  connection: Connection,
  location: { projectId: string; artifactIds: string[] },
): Promise<ArtifactReferences[]> {
  const parameters = [location.projectId, location.artifactIds];
  // クエリは1つずつ順に投げる。トランザクションの中では1つのクライアントを共有するため。
  const artifacts = await rows<{ id: string }>(
    connection,
    'SELECT id FROM artifacts WHERE project_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL',
    parameters,
  );
  const modelVersions = await rows<ArtifactOwner<ArtifactReferences['modelVersions'][number]>>(
    connection,
    `SELECT a.id AS artifact_id,version.id,version.model_id,model.name AS model_name,version.version
     FROM artifacts a
     JOIN model_versions version ON version.project_id=a.project_id AND (version.artifact_id=a.id
       OR version.metadata #> '{mlflow,artifactManifest}'
          @> jsonb_build_array(jsonb_build_object('artifactId',a.id::text)))
     JOIN models model ON model.id=version.model_id
     WHERE a.project_id=$1 AND a.id=ANY($2::uuid[])
     ORDER BY model.name,version.created_at DESC`,
    parameters,
  );
  const datasetVersions = await rows<ArtifactOwner<ArtifactReferences['datasetVersions'][number]>>(
    connection,
    `SELECT file.artifact_id,version.id,version.dataset_id,dataset.name AS dataset_name,
       version.version,file.path
     FROM dataset_version_files file
     JOIN dataset_versions version ON version.id=file.dataset_version_id
     JOIN datasets dataset ON dataset.id=version.dataset_id
     WHERE file.project_id=$1 AND file.artifact_id=ANY($2::uuid[])
     ORDER BY dataset.name,version.created_at DESC`,
    parameters,
  );
  const codeVersions = await rows<ArtifactOwner<ArtifactReferences['codeVersions'][number]>>(
    connection,
    `SELECT a.id AS artifact_id,version.id,version.code_id,code.name AS code_name,version.version
     FROM artifacts a
     JOIN code_versions version ON version.project_id=a.project_id
       AND (version.source->>'artifactId'=a.id::text OR version.runtime->>'artifactId'=a.id::text)
     JOIN codes code ON code.id=version.code_id
     WHERE a.project_id=$1 AND a.id=ANY($2::uuid[])
     ORDER BY code.name,version.created_at DESC`,
    parameters,
  );
  // stepはbigintなので文字列で届く。
  const checkpoints = await rows<
    ArtifactOwner<Omit<ArtifactReferences['checkpoints'][number], 'step'> & { step: string }>
  >(
    connection,
    `SELECT artifact_id,checkpoint.id,checkpoint.run_id,run.name AS run_name,checkpoint.step
     FROM run_checkpoints checkpoint
     CROSS JOIN LATERAL unnest(checkpoint.artifact_ids) AS artifact_id
     JOIN runs run ON run.id=checkpoint.run_id
     WHERE checkpoint.project_id=$1 AND artifact_id=ANY($2::uuid[])
       AND (checkpoint.retained OR EXISTS(SELECT 1 FROM runs resumed
         WHERE resumed.resume_checkpoint_id=checkpoint.id))
     ORDER BY run.name,checkpoint.step`,
    parameters,
  );
  const listed = new Map<string, ArtifactReferences>(
    artifacts.map(({ id }) => [
      id,
      { artifactId: id, modelVersions: [], datasetVersions: [], codeVersions: [], checkpoints: [] },
    ]),
  );
  for (const { artifactId, ...version } of modelVersions)
    listed.get(artifactId)?.modelVersions.push(version);
  for (const { artifactId, ...version } of datasetVersions)
    listed.get(artifactId)?.datasetVersions.push(version);
  for (const { artifactId, ...version } of codeVersions)
    listed.get(artifactId)?.codeVersions.push(version);
  // checkpointのstepは2^53よりはるかに小さい。
  for (const { artifactId, step, ...checkpoint } of checkpoints)
    listed.get(artifactId)?.checkpoints.push({ ...checkpoint, step: Number(step) });
  const samples = await rows<ArtifactOwner<{ runId: string; runName: string }>>(
    connection,
    `SELECT sample.artifact_id,sample.run_id,run.name AS run_name FROM preprocessing_report_samples sample
     JOIN runs run ON run.id=sample.run_id WHERE sample.project_id=$1 AND sample.artifact_id=ANY($2::uuid[])`,
    parameters,
  );
  for (const { artifactId, ...report } of samples) {
    const owners = listed.get(artifactId);
    if (owners) (owners.preprocessingReports ??= []).push(report);
  }
  return [...listed.values()];
}

/** 参照している記録と、それが生かしているArtifact。 */
type ArtifactOwner<Referencing> = Referencing & { artifactId: string };

/** 渡したArtifactのうち参照のあるものについて、参照の種類を返す。参照の無いArtifactは含めない。 */
export async function findArtifactReferences(
  connection: Connection,
  location: { projectId: string; artifactIds: string[] },
): Promise<Map<string, ArtifactReferenceKind[]>> {
  const conditions = Object.entries(referenceConditions('a')) as [ArtifactReferenceKind, string][];
  const found = await rows<{ id: string; kinds: (ArtifactReferenceKind | null)[] }>(
    connection,
    `SELECT a.id,ARRAY[${conditions
      .map(([kind, condition]) => `CASE WHEN ${condition} THEN '${kind}' END`)
      .join(',')}] AS kinds
     FROM artifacts a WHERE a.project_id=$1 AND a.id=ANY($2::uuid[])`,
    [location.projectId, location.artifactIds],
  );
  const references = new Map<string, ArtifactReferenceKind[]>();
  for (const artifact of found) {
    const kinds = artifact.kinds.filter((kind): kind is ArtifactReferenceKind => kind !== null);
    if (kinds.length) references.set(artifact.id, kinds);
  }
  return references;
}
