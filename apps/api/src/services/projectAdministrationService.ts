import type { AdminProject } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { purgeProjectRows } from '../repositories/projectPurgeRepository.js';
import {
  findAdminProject,
  listAdminProjects,
  lockProjectLifecycle,
  markProjectPurged,
  unarchiveProject,
} from '../repositories/projectRepository.js';
import { requireGlobalAdmin } from './accessService.js';
import { requireSession } from './tokenService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';

/**
 * 全体管理者がすべてのProjectに対して行う操作（/admin/projects）。アーカイブしたものも含めた
 * 一覧、アーカイブしたProjectの復元、Projectの完全な削除。
 */
export class ProjectAdministrationService {
  constructor(private readonly database: Database) {}

  async list(principal: Principal, query: { includeArchived: boolean }): Promise<AdminProject[]> {
    requireGlobalAdmin(principal);
    return listAdminProjects(this.database, query);
  }

  /** アーカイブしたProjectを元の状態に戻す。アーカイブされていないProjectの復元は何もしない。 */
  async restore(
    principal: Principal,
    projectId: string,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<AdminProject> {
    const draft = this.auditDraft(principal, { action: 'project.restore', projectId, request });
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        requireGlobalAdmin(principal);
        const project = await lockProjectLifecycle(connection, projectId);
        if (!project) notFound('project');
        if (project.archivedAt) {
          await unarchiveProject(connection, projectId);
          await writeAuditEvent(connection, {
            ...draft,
            outcome: 'success',
            details: { name: project.name, archivedAt: project.archivedAt },
          });
        }
        return (await findAdminProject(connection, projectId))!;
      }),
    );
  }

  /**
   * アーカイブしたProjectの行を1つのトランザクションで削除し、blobをキューに入れる。blobは
   * コミットのあとでArtifactGarbageCollectorがストレージから消す（projectPurgeRepositoryを参照）。
   * 元に戻せないので、利用者の管理と同じく、tokenではなくブラウザのsessionを要する。
   */
  async purge(
    principal: Principal,
    projectId: string,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const draft = this.auditDraft(principal, { action: 'project.purge', projectId, request });
    await recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        requireGlobalAdmin(principal);
        requireSession(principal, 'permanently deleting a project');
        const project = await lockProjectLifecycle(connection, projectId);
        if (!project) notFound('project');
        if (!project.archivedAt)
          throw new DomainError({
            status: 409,
            code: 'project_not_archived',
            message: 'a project that is not archived cannot be permanently deleted',
          });
        // 先に完全削除の印を付ける。履歴のトリガーは、その印が付いたProjectの行しか削除させない。
        await markProjectPurged(connection, { projectId, purgedBy: principal.user.id });
        const purged = await purgeProjectRows(connection, projectId);
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { name: project.name, ...purged },
        });
      }),
    );
  }

  private auditDraft(
    principal: Principal,
    event: { action: string; projectId: string; request: RequestMetadata },
  ): AuditEventDraft {
    return {
      ...auditActor(principal),
      ...event.request,
      action: event.action,
      resourceType: 'project',
      resourceId: event.projectId,
      projectId: event.projectId,
    };
  }
}
