import { randomUUID } from 'node:crypto';
import type { Dataset, DatasetVersion, ExternalDatasetRef, JsonObject, Run } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';
import { datasetManifestDigest } from '../domain/datasetManifestDigest.js';
import { conflict, DomainError, notFound } from '../domain/errors.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import { assertProjectReference, findRun } from '../repositories/registryRepository.js';
import { runColumns } from '../repositories/runListProjection.js';
import { requireProject } from './accessService.js';
import { lockDatasetsOfVersions } from './datasetVersionReferences.js';
import type { ModelVersionRegistrationActor } from './modelVersionRegistration.js';
import { enqueueRunEvent } from './outboxEvents.js';

// データセットバージョンを登録するのは、モデルバージョンと同じ2種類のactorと、principalを独自の
// 規則で確認済みの呼び出し元（pluginの取り込みはProject adminが要り、MLflowのlog_inputsは
// データセットごとにscopeを確かめる）。
export type DatasetVersionRegistrationActor =
  | ModelVersionRegistrationActor
  | { type: 'callerAuthorized' };

/** 'artifacts'のバージョンの1ファイル。Artifactのsizeとsha256は調べ済み。 */
export interface DatasetManifestFile {
  path: string;
  artifactId: string;
  size: number;
  sha256: string;
}

interface DatasetVersionRegistrationBase {
  projectId: string;
  datasetId: string;
  // 省略したときは、データセットの整数のバージョンの次の整数になる。
  version?: string;
  schema: JsonObject;
  metadata: JsonObject;
  sourceRunId?: string | null;
  parentDatasetVersionIds: string[];
  actor: DatasetVersionRegistrationActor;
}

/** ほかの場所に置いたデータ。クライアントが送ったuriとdigestをそのまま持つ。 */
interface ReferenceContentRegistration {
  uri: string;
  digest: string;
  externalRef?: ExternalDatasetRef | null;
  content?: undefined;
}

/**
 * バージョンの中身はこれらのArtifact。サーバーがuriを`mmt-dataset://<versionId>`にし、manifestの
 * digestを計算する。クライアントがdigestを送ったなら、それと一致する必要がある。
 */
interface ArtifactContentRegistration {
  content: { files: DatasetManifestFile[] };
  digest?: string;
  uri?: undefined;
  externalRef?: undefined;
}

export type DatasetVersionRegistration = DatasetVersionRegistrationBase &
  (ReferenceContentRegistration | ArtifactContentRegistration);

// API自身が解決する（GET .../versions/:v/files）。W5のworkerはここを通してファイルを取る。
const DATASET_VERSION_URI_SCHEME = 'mmt-dataset://';

// 整数でないバージョン（"2026-10"、"v1"）はそのまま残し、番号付けに加わらない。
// 18桁ならbigintに収まる。
const INTEGER_VERSION_PATTERN = '^[1-9][0-9]{0,17}$';

/**
 * 呼び出し元のトランザクションの中で、変更できないDatasetVersionと、中身がArtifactならその
 * ファイル一覧を挿入し、元のRunの出力に並べる。Runが終わったあとに届いた登録は、外部の
 * lineageが新しい出力を見られるよう、Runのoutboxのイベントを送り直す。
 */
export async function registerDatasetVersion(
  connection: Connection,
  registration: DatasetVersionRegistration,
): Promise<DatasetVersion> {
  const { projectId, actor } = registration;
  if (actor.type === 'principal')
    await requireProject(connection, actor.principal, {
      projectId,
      role: 'editor',
      scope: 'registry:write',
    });
  const dataset = await first<Dataset>(
    connection,
    'SELECT * FROM datasets WHERE id=$1 AND project_id=$2',
    [registration.datasetId, projectId],
  );
  if (!dataset) notFound('dataset');
  // 親はこのトランザクションより長く残る必要がある（バージョンの削除は待つか、既に1つ消していて
  // こちらが404を返す）。バージョンの名前を省いたものはDatasetの整数のバージョンの次の番号になり、
  // そのDatasetを独占する必要がある。親と同じidの順でロックする。名前を指定したバージョンには
  // 自分のロックは要らない。別のバージョンを削除しても、それには触れない。
  await lockDatasetsOfVersions(connection, {
    projectId,
    versionIds: registration.parentDatasetVersionIds,
    numberingDatasetId: registration.version ? undefined : dataset.id,
  });
  const sourceRun = registration.sourceRunId
    ? await findRun(connection, {
        projectId,
        id: registration.sourceRunId,
        lock: true,
      })
    : null;
  if (actor.type === 'runCreator') {
    if (!sourceRun)
      throw new DomainError({
        status: 422,
        code: 'source_run_required',
        message: 'sourceRunId is required to register as the creator of the run',
      });
    await requireRunCreatorRegistryAccess(connection, {
      projectId,
      userId: sourceRun.createdBy,
    });
  }
  if (registration.externalRef) {
    const reference = registration.externalRef;
    await assertProjectReference(connection, {
      table: 'plugin_connections',
      projectId,
      id: reference.pluginId,
    });
    if (
      reference.version !== registration.version ||
      reference.name !== dataset.name ||
      reference.namespace !== dataset.namespace
    )
      conflict('the reference of the external dataset does not match the version being registered');
  }
  const stored = describeStoredContent(registration);
  const version = registration.version ?? (await nextDatasetVersion(connection, dataset.id));
  const inserted = (await first<Omit<DatasetVersion, 'name' | 'namespace'>>(
    connection,
    `INSERT INTO dataset_versions(id,dataset_id,project_id,version,uri,digest,schema,metadata,source_run_id,parent_dataset_version_ids,external_ref,content_kind,file_count,total_size)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      stored.id,
      dataset.id,
      projectId,
      version,
      stored.uri,
      stored.digest,
      JSON.stringify(registration.schema),
      JSON.stringify(registration.metadata),
      sourceRun?.id ?? null,
      registration.parentDatasetVersionIds,
      registration.externalRef ? JSON.stringify(registration.externalRef) : null,
      stored.contentKind,
      stored.fileCount,
      stored.totalSize,
    ],
  ))!;
  if (registration.content)
    await insertDatasetVersionFiles(connection, {
      projectId,
      datasetVersionId: inserted.id,
      files: registration.content.files,
    });
  if (sourceRun) {
    const updatedRun = (await first<Run>(
      connection,
      `UPDATE runs SET output_dataset_version_ids=array_append(output_dataset_version_ids,$2::uuid) WHERE id=$1 RETURNING ${runColumns}`,
      [sourceRun.id, inserted.id],
    ))!;
    if (isTerminalStatus(updatedRun.status)) await enqueueRunEvent(connection, updatedRun);
  }
  return { ...inserted, name: dataset.name, namespace: dataset.namespace };
}

interface StoredDatasetContent {
  id: string;
  uri: string;
  digest: string;
  contentKind: DatasetVersion['contentKind'];
  fileCount: number | null;
  totalSize: number | null;
}

function describeStoredContent(registration: DatasetVersionRegistration): StoredDatasetContent {
  // 変更できない行はINSERTの時点で自分のuriを持つ必要があるので、idをここで決める。
  const id = randomUUID();
  if (!registration.content)
    return {
      id,
      uri: registration.uri,
      digest: registration.digest,
      contentKind: 'reference',
      fileCount: null,
      totalSize: null,
    };
  const { files } = registration.content;
  const digest = datasetManifestDigest(files);
  if (registration.digest !== undefined && registration.digest !== digest)
    throw new DomainError({
      status: 422,
      code: 'dataset_digest_mismatch',
      message: `the digest does not match the value computed from the file list (${digest})`,
      details: { expectedDigest: digest },
    });
  return {
    id,
    uri: `${DATASET_VERSION_URI_SCHEME}${id}`,
    digest,
    contentKind: 'artifacts',
    fileCount: files.length,
    totalSize: files.reduce((total, file) => total + file.size, 0),
  };
}

// 配列を引数に渡す1つの文で、MAX_DATASET_VERSION_FILES行まで挿入する。
async function insertDatasetVersionFiles(
  connection: Connection,
  manifest: { projectId: string; datasetVersionId: string; files: DatasetManifestFile[] },
): Promise<void> {
  const { files } = manifest;
  await connection.query(
    `INSERT INTO dataset_version_files(dataset_version_id,project_id,path,artifact_id,size,sha256)
    SELECT $1,$2,file.path,file.artifact_id,file.size,file.sha256
    FROM unnest($3::text[],$4::uuid[],$5::bigint[],$6::text[]) AS file(path,artifact_id,size,sha256)`,
    [
      manifest.datasetVersionId,
      manifest.projectId,
      files.map((file) => file.path),
      files.map((file) => file.artifactId),
      files.map((file) => file.size),
      files.map((file) => file.sha256),
    ],
  );
}

// 呼び出し元がデータセットの行をFOR UPDATEで持っているので、同時の登録は別々の番号を取る。
async function nextDatasetVersion(connection: Connection, datasetId: string): Promise<string> {
  const next = (await first<{ version: string }>(
    connection,
    `SELECT (COALESCE(MAX(version::bigint),0)+1)::text AS version FROM dataset_versions
    WHERE dataset_id=$1 AND version ~ '${INTEGER_VERSION_PATTERN}'`,
    [datasetId],
  ))!;
  return next.version;
}

// modelVersionRegistration.tsと同じ規則。システムのactorは、実際に効いている権限（直接付与、
// group binding、公開設定）でeditorかadminのroleを持つ必要があり、全体管理者がsessionでだけ
// 持つアクセスは引き継がない。
async function requireRunCreatorRegistryAccess(
  connection: Connection,
  member: { projectId: string; userId: string },
): Promise<void> {
  const membership = await first(
    connection,
    "SELECT 1 FROM effective_project_roles WHERE project_id=$1 AND user_id=$2 AND role IN ('editor','admin')",
    [member.projectId, member.userId],
  );
  if (!membership)
    throw new DomainError({
      status: 403,
      code: 'project_forbidden',
      message: 'the creator of the run does not have edit permission in the project',
    });
}
