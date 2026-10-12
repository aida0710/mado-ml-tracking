import type { ArtifactReferences } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';

/** Records that keep an Artifact's bytes alive; while any exists the Artifact cannot be deleted. */
export type ArtifactReferenceKind =
  | 'model_version'
  | 'code_version'
  | 'dataset_version'
  | 'checkpoint'
  | 'preprocessing_report';

/**
 * One SQL condition per reference kind, for an artifacts row aliased `artifact`. Registered model
 * versions point at an Artifact directly or through their immutable MLflow manifest. A checkpoint
 * protects its files while it is retained or a Run continues from it; hidden checkpoints
 * (retained=false) do not, which is how old checkpoint files become deletable.
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

/** SQL condition that is true when nothing keeps the Artifact aliased `artifact`. */
export function unreferencedArtifactCondition(artifact: string): string {
  return `NOT (${Object.values(referenceConditions(artifact)).join(' OR ')})`;
}

/**
 * The records behind each reference kind, by name, for every given live Artifact (an Artifact with
 * none has empty lists). Each query matches what referenceConditions counts, so a file shown here
 * as unused is one deletion accepts.
 */
export async function listArtifactReferences(
  connection: Connection,
  location: { projectId: string; artifactIds: string[] },
): Promise<ArtifactReferences[]> {
  const parameters = [location.projectId, location.artifactIds];
  // One query after another: inside a transaction they would share a single client.
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
  // step is a bigint, which arrives as a string.
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
  // Checkpoint steps stay far below 2^53.
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

/** A referencing record with the Artifact it keeps. */
type ArtifactOwner<Referencing> = Referencing & { artifactId: string };

/** The reference kinds of each given Artifact that has any; unreferenced Artifacts are absent. */
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
