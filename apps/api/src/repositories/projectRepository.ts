import type { AdminProject, Project } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';

/** APIが返す形のProjectの行。呼び出し元のroleは含まない。 */
export type ProjectRecord = Omit<Project, 'role' | 'isMember'>;

// APIのProjectのフィールド（roleを除いたProject）。アーカイブとpurgeの列は内部にとどめる。
export const PROJECT_COLUMNS =
  'p.id,p.name,p.description,p.artifact_backend,p.visibility,p.created_at';

/**
 * `projectParameter`（`$2`のようなプレースホルダ）で指すProjectがアーカイブされていない間、
 * 真になるSQL。裏で動く処理の所有者の検査に使い、全体管理者の自動実行もメンバーのものと同じく
 * Projectとともに止まるようにする。
 */
export function liveProjectSql(projectParameter: string): string {
  return `EXISTS(SELECT 1 FROM projects live_project WHERE live_project.id=${projectParameter} AND live_project.archived_at IS NULL)`;
}

export async function insertProject(
  connection: Connection,
  project: Pick<ProjectRecord, 'name' | 'description' | 'artifactBackend' | 'visibility'>,
): Promise<ProjectRecord> {
  return (await first<ProjectRecord>(
    connection,
    `INSERT INTO projects AS p(name,description,artifact_backend,visibility) VALUES($1,$2,$3,$4)
    RETURNING ${PROJECT_COLUMNS}`,
    [project.name, project.description, project.artifactBackend, project.visibility],
  ))!;
}

export async function updateProject(
  connection: Connection,
  change: { projectId: string } & Partial<
    Pick<ProjectRecord, 'description' | 'artifactBackend' | 'visibility'>
  >,
): Promise<ProjectRecord> {
  return (await first<ProjectRecord>(
    connection,
    `UPDATE projects AS p SET description=COALESCE($2,description),
      artifact_backend=COALESCE($3,artifact_backend),visibility=COALESCE($4,visibility)
    WHERE id=$1 RETURNING ${PROJECT_COLUMNS}`,
    [change.projectId, change.description, change.artifactBackend, change.visibility],
  ))!;
}

export interface ProjectLifecycle {
  id: string;
  name: string;
  archivedAt: string | null;
}

/**
 * アーカイブ、復元、purgeのために、purgeされていないProjectをアーカイブ済みかどうかによらず
 * ロックする。purgeしたProjectは、どの呼び出し元からも無いものとして扱う。
 */
export async function lockProjectLifecycle(
  connection: Connection,
  projectId: string,
): Promise<ProjectLifecycle | undefined> {
  return first<ProjectLifecycle>(
    connection,
    'SELECT id,name,archived_at FROM projects WHERE id=$1 AND purged_at IS NULL FOR UPDATE',
    [projectId],
  );
}

/**
 * アーカイブされていないProjectをトランザクションの終わりまで押さえ、Jobの作成とProjectの
 * アーカイブを直列にする。アーカイブがJobを見て拒むか、Jobがアーカイブを見るかのどちらかになる。
 */
export async function shareLiveProject(
  connection: Connection,
  projectId: string,
): Promise<boolean> {
  const live = await first(
    connection,
    'SELECT id FROM projects WHERE id=$1 AND archived_at IS NULL FOR SHARE',
    [projectId],
  );
  return !!live;
}

/**
 * ProjectのJobが待機中か実行中（queued、claimed、running）か、siteのスケジューラのキューにある
 * 間に取り消され、launcherがまだそこから消していないか。launcherはそのキューの項目をJobの行から
 * 見つけるが、purgeするとその行が消える。
 */
export async function hasActiveJobs(connection: Connection, projectId: string): Promise<boolean> {
  const active = await first(
    connection,
    `SELECT 1 FROM jobs WHERE project_id=$1
    AND (status IN ('queued','claimed','running') OR scheduler_cancel_state='pending') LIMIT 1`,
    [projectId],
  );
  return !!active;
}

export async function archiveProject(
  connection: Connection,
  archive: { projectId: string; archivedBy: string },
): Promise<void> {
  await connection.query('UPDATE projects SET archived_at=now(),archived_by=$2 WHERE id=$1', [
    archive.projectId,
    archive.archivedBy,
  ]);
}

export async function unarchiveProject(connection: Connection, projectId: string): Promise<void> {
  await connection.query('UPDATE projects SET archived_at=NULL,archived_by=NULL WHERE id=$1', [
    projectId,
  ]);
}

/** アーカイブしたProjectを墓標にする。残るのはidと名前だけ。 */
export async function markProjectPurged(
  connection: Connection,
  purge: { projectId: string; purgedBy: string },
): Promise<void> {
  await connection.query(
    "UPDATE projects SET purged_at=now(),purged_by=$2,description='' WHERE id=$1",
    [purge.projectId, purge.purgedBy],
  );
}

// メンバーは直接の付与とグループの割り当て（project_membership_roles）で、公開による閲覧は
// 含めない。MLflowから削除したRunは数えない。
const adminProjectSelect = `SELECT ${PROJECT_COLUMNS},p.archived_at,
  (SELECT count(*)::int FROM project_membership_roles m WHERE m.project_id=p.id) AS member_count,
  ARRAY(SELECT u.display_name FROM project_membership_roles m JOIN users u ON u.id=m.user_id
    WHERE m.project_id=p.id AND m.role='admin' AND u.kind='human'
    ORDER BY lower(u.display_name),u.id) AS admin_names,
  (SELECT count(*)::int FROM runs r WHERE r.project_id=p.id AND r.lifecycle_stage='active') AS run_count
  FROM projects p`;

export async function listAdminProjects(
  connection: Connection,
  query: { includeArchived: boolean },
): Promise<AdminProject[]> {
  return rows<AdminProject>(
    connection,
    `${adminProjectSelect} WHERE p.purged_at IS NULL AND ($1 OR p.archived_at IS NULL)
    ORDER BY p.created_at DESC,p.id`,
    [query.includeArchived],
  );
}

export async function findAdminProject(
  connection: Connection,
  projectId: string,
): Promise<AdminProject | undefined> {
  return first<AdminProject>(
    connection,
    `${adminProjectSelect} WHERE p.id=$1 AND p.purged_at IS NULL`,
    [projectId],
  );
}
