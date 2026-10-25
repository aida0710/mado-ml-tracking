import type {
  Artifact,
  ArtifactDirectoryEntry,
  ArtifactListVersions,
  ArtifactPage,
  ArtifactTree,
} from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';
import { DomainError } from '../domain/errors.js';

// ツリーの1階層にはファイルでなくディレクトリを並べる。この数を超えたら、切り詰めたことを
// 応答で示す。
export const MAX_TREE_DIRECTORIES = 1000;

/**
 * Runがそのパスで今表示しているArtifactに対して真になるSQLの条件。
 * MLflowのパスの対応付けは常に優先する（あとからnativeで再試行しても置き換わらない）。
 * Artifactを持たない対応付け（MLflowのdelete_artifacts）があるパスには何も表示しない。
 * 対応付けが無ければ、削除されていない最新のArtifactを採り、created_atが同じならidで決める。
 * MLflowのArtifact一覧も同じ規則を使うので、どちらのAPIでも同じパスには同じファイルが出る。
 * 削除済みのArtifactは呼び出し側で除く。
 */
export function currentRunArtifactCondition(artifact: string): string {
  return `COALESCE(
    (SELECT mapping.artifact_id IS NOT DISTINCT FROM ${artifact}.id FROM mlflow_artifact_paths mapping
     WHERE mapping.project_id=${artifact}.project_id AND mapping.owner_kind='run'
       AND mapping.owner_id=${artifact}.run_id::text AND mapping.path=${artifact}.path),
    NOT EXISTS(SELECT 1 FROM artifacts newer
     WHERE newer.project_id=${artifact}.project_id
       AND (newer.run_id=${artifact}.run_id OR (newer.run_id IS NULL AND ${artifact}.run_id IS NULL))
       AND newer.path COLLATE "C"=${artifact}.path COLLATE "C" AND newer.deleted_at IS NULL
       AND (newer.created_at,newer.id)>(${artifact}.created_at,${artifact}.id)))`;
}

/** Runの一覧はパスの順。同じパスのバージョンは新しい順に続く。 */
interface RunArtifactCursor {
  kind: 'run';
  path: string;
  createdAt: string;
  id: string;
}

/** Projectのカタログは新しい順。 */
interface CatalogCursor {
  kind: 'catalog';
  createdAt: string;
  id: string;
}

type ListingCursor = RunArtifactCursor | CatalogCursor;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 下のto_charの出力。マイクロ秒まで持ってkeysetを正確に保つ。JavaScriptのDateでは丸められる。
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const CURSOR_TIMESTAMP_SQL = `to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

function invalidCursor(): never {
  throw new DomainError({ status: 400, code: 'invalid_cursor', message: 'invalid cursor' });
}

function encodeCursor(cursor: ListingCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor<K extends ListingCursor['kind']>(
  token: string,
  kind: K,
): Extract<ListingCursor, { kind: K }> {
  let cursor: Partial<RunArtifactCursor> & { kind?: unknown };
  try {
    cursor = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as typeof cursor;
  } catch {
    invalidCursor();
  }
  if (
    typeof cursor !== 'object' ||
    cursor === null ||
    cursor.kind !== kind ||
    typeof cursor.id !== 'string' ||
    !UUID_PATTERN.test(cursor.id) ||
    typeof cursor.createdAt !== 'string' ||
    !CURSOR_TIMESTAMP_PATTERN.test(cursor.createdAt) ||
    (kind === 'run' && typeof cursor.path !== 'string')
  )
    invalidCursor();
  return cursor as Extract<ListingCursor, { kind: K }>;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** prefixで始まるパスのLIKEパターン。C照合順序なので、PostgreSQLは範囲として走査できる。 */
function startsWithPattern(prefix: string): string {
  return `${escapeLikePattern(prefix)}%`;
}

/** ツリーの階層はディレクトリ。''はルートで、それ以外のprefixには末尾に`/`を付ける。 */
export function directoryPrefix(prefix: string): string {
  return prefix === '' || prefix.endsWith('/') ? prefix : `${prefix}/`;
}

type ListedArtifact = Artifact & { listingCreatedAt: string };

function toPage(
  listed: ListedArtifact[],
  limit: number,
  cursorOf: (last: ListedArtifact) => ListingCursor,
): ArtifactPage {
  const hasMore = listed.length > limit;
  const page = listed.slice(0, limit);
  const items = page.map(({ listingCreatedAt: _cursorTimestamp, ...artifact }) => artifact);
  return hasMore ? { items, nextCursor: encodeCursor(cursorOf(page.at(-1)!)) } : { items };
}

export interface RunArtifactQuery {
  projectId: string;
  runId: string;
  /** パスのprefixそのもの。ディレクトリだけでなく、ファイル名の前方部分でもよい。 */
  prefix: string;
  /** S3の`/`区切りと同じく、prefixの直下のファイルだけ。 */
  directFilesOnly: boolean;
  versions: ArtifactListVersions;
  limit: number;
  cursor?: string;
}

export async function listRunArtifacts(
  connection: Connection,
  query: RunArtifactQuery,
): Promise<ArtifactPage> {
  const after = query.cursor ? decodeCursor(query.cursor, 'run') : null;
  const listed = await rows<ListedArtifact>(
    connection,
    `SELECT a.*,${CURSOR_TIMESTAMP_SQL} AS listing_created_at FROM artifacts a
     WHERE a.project_id=$1 AND a.run_id=$2 AND a.path COLLATE "C" LIKE $3 AND a.deleted_at IS NULL
       AND (NOT $4::boolean OR strpos(substr(a.path,length($5)+1),'/')=0)
       AND ($6::text IS NULL OR a.path COLLATE "C">$6 COLLATE "C"
            OR (a.path=$6 AND (a.created_at,a.id)<($7::timestamptz,$8::uuid)))
       AND ($9='all' OR ${currentRunArtifactCondition('a')})
     ORDER BY a.path COLLATE "C",a.created_at DESC,a.id DESC LIMIT $10`,
    [
      query.projectId,
      query.runId,
      startsWithPattern(query.prefix),
      query.directFilesOnly,
      query.prefix,
      after?.path ?? null,
      after?.createdAt ?? null,
      after?.id ?? null,
      query.versions,
      query.limit + 1,
    ],
  );
  return toPage(listed, query.limit, (last) => ({
    kind: 'run',
    path: last.path,
    createdAt: last.listingCreatedAt,
    id: last.id,
  }));
}

export async function runArtifactTree(
  connection: Connection,
  location: { projectId: string; runId: string; prefix: string },
): Promise<ArtifactTree> {
  const prefix = directoryPrefix(location.prefix);
  // 直下のファイルは''に、サブディレクトリはパスの最初の要素ごとにまとめる。
  const groups = await rows<ArtifactTreeGroup>(
    connection,
    `SELECT child,count(*) AS file_count,sum(size) AS total_size FROM (
       SELECT a.size,CASE WHEN strpos(substr(a.path,length($4)+1),'/')=0 THEN ''
                     ELSE split_part(substr(a.path,length($4)+1),'/',1) END AS child
       FROM artifacts a
       WHERE a.project_id=$1 AND a.run_id=$2 AND a.path COLLATE "C" LIKE $3 AND a.deleted_at IS NULL
         AND ${currentRunArtifactCondition('a')}
     ) listed GROUP BY child ORDER BY child COLLATE "C" LIMIT $5`,
    [
      location.projectId,
      location.runId,
      startsWithPattern(prefix),
      prefix,
      MAX_TREE_DIRECTORIES + 2,
    ],
  );
  return artifactTreeFromGroups(prefix, groups);
}

/** ツリーの1階層の子ごとの行。直下のファイルは''、それ以外はディレクトリ名。 */
export interface ArtifactTreeGroup {
  child: string;
  fileCount: string;
  totalSize: string;
}

/**
 * 子の順に並んだグループからツリーの1階層を作る。グループはMAX_TREE_DIRECTORIES + 2件を上限に
 * 取る（直下のファイルの分と、切り詰めたと分かるよう表示より1つ多いディレクトリの分）。
 * データセットバージョンも同じ形でファイルを並べる。
 */
export function artifactTreeFromGroups(prefix: string, groups: ArtifactTreeGroup[]): ArtifactTree {
  const files = groups.find((group) => group.child === '');
  const directories: ArtifactDirectoryEntry[] = groups
    .filter((group) => group.child !== '')
    .map((group) => ({
      prefix: `${prefix}${group.child}/`,
      fileCount: Number(group.fileCount),
      totalSize: Number(group.totalSize),
    }));
  return {
    prefix,
    directories: directories.slice(0, MAX_TREE_DIRECTORIES),
    directoriesTruncated: directories.length > MAX_TREE_DIRECTORIES,
    fileCount: Number(files?.fileCount ?? 0),
    totalSize: Number(files?.totalSize ?? 0),
  };
}

export interface ProjectArtifactQuery {
  projectId: string;
  limit: number;
  /** パスの部分文字列。 */
  query?: string;
  /** `type/subtype`か、すべてのsubtypeなら`type/*`。 */
  mimeType?: string;
  runId?: string;
  /**
   * そのモデルバージョンに登録したArtifactと、そのバージョンを使ったRunの出力（推論と評価のRunは
   * modelVersionIdとしてバージョンを記録する）。
   */
  modelVersionId?: string;
  /** modelVersionIdと同じことを、登録モデルの全バージョンについて行う。 */
  modelId?: string;
  versions: ArtifactListVersions;
  cursor?: string;
}

/** `; charset=utf-8`のようなパラメータを除いた、保存した型と比べる。 */
function mimeTypePattern(mimeType: string): string {
  const essence = mimeType.toLowerCase();
  return essence.endsWith('/*')
    ? startsWithPattern(essence.slice(0, -1))
    : escapeLikePattern(essence);
}

export async function listProjectArtifacts(
  connection: Connection,
  query: ProjectArtifactQuery,
): Promise<ArtifactPage> {
  const after = query.cursor ? decodeCursor(query.cursor, 'catalog') : null;
  const listed = await rows<ListedArtifact>(
    connection,
    `SELECT a.*,${CURSOR_TIMESTAMP_SQL} AS listing_created_at FROM artifacts a
     WHERE a.project_id=$1 AND a.deleted_at IS NULL
       AND ($2::text IS NULL OR a.path ILIKE '%' || $2 || '%')
       AND ($3::text IS NULL OR lower(trim(split_part(a.mime_type,';',1))) LIKE $3)
       AND ($4::uuid IS NULL OR a.run_id=$4)
       AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM model_versions version
            WHERE version.id=$5 AND version.project_id=a.project_id AND version.artifact_id=a.id)
         OR EXISTS(SELECT 1 FROM runs run
            WHERE run.id=a.run_id AND run.project_id=a.project_id AND run.model_version_id=$5))
       AND ($10::uuid IS NULL OR EXISTS(SELECT 1 FROM model_versions version
            WHERE version.model_id=$10 AND version.project_id=a.project_id AND version.artifact_id=a.id)
         OR EXISTS(SELECT 1 FROM runs run JOIN model_versions version ON version.id=run.model_version_id
            WHERE run.id=a.run_id AND run.project_id=a.project_id AND version.model_id=$10))
       AND ($6::timestamptz IS NULL OR (a.created_at,a.id)<($6,$7::uuid))
       AND ($8='all' OR ${currentRunArtifactCondition('a')})
       -- Server-side previews are Runless Artifacts the viewer reads through /previews, not catalog items.
       AND (a.run_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM artifact_previews preview
            WHERE preview.preview_artifact_id=a.id))
     ORDER BY a.created_at DESC,a.id DESC LIMIT $9`,
    [
      query.projectId,
      query.query ?? null,
      query.mimeType ? mimeTypePattern(query.mimeType) : null,
      query.runId ?? null,
      query.modelVersionId ?? null,
      after?.createdAt ?? null,
      after?.id ?? null,
      query.versions,
      query.limit + 1,
      query.modelId ?? null,
    ],
  );
  return toPage(listed, query.limit, (last) => ({
    kind: 'catalog',
    createdAt: last.listingCreatedAt,
    id: last.id,
  }));
}
