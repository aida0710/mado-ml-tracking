import type { ProjectRole, SavedView } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { satisfiesProjectRole } from '../domain/projectRoles.js';
import {
  validateSavedViewState,
  type SavedViewCreateInput,
  type SavedViewListQuery,
  type SavedViewPatchInput,
} from '../domain/savedViewValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  deleteSavedView,
  findSavedView,
  insertSavedView,
  isSavedViewNameConflict,
  listVisibleSavedViews,
  updateSavedView,
} from '../repositories/savedViewRepository.js';
import { rejectJobToken, requireProject } from './accessService.js';
import {
  auditActor,
  DENIED_STATUSES,
  NO_REQUEST_METADATA,
  type AuditEventDraft,
} from './auditService.js';

interface SavedViewReference {
  projectId: string;
  savedViewId: string;
}

// 保存ビューは表示の設定なので、tokenでの書き込みにはRunの一覧の変更と同じscopeを使う。
const SAVED_VIEW_WRITE_SCOPE = 'runs:write';
// ビューをProjectに共有するとすべてのメンバーの見るものが変わるので、ほかのeditorの
// 操作と同じに扱う。
const SHARED_VIEW_ROLE: ProjectRole = 'editor';

// 名前の衝突は一意インデックスで決めるので、同じ名前の保存が同時に来ても両方は通らない。
async function rejectNameConflict<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (isSavedViewNameConflict(error))
      throw new DomainError({
        status: 409,
        code: 'saved_view_name_conflict',
        message: 'a saved view with the same name already exists',
      });
    throw error;
  }
}

function requireSharingRole(role: ProjectRole): void {
  if (!satisfiesProjectRole(role, SHARED_VIEW_ROLE))
    throw new DomainError({
      status: 403,
      code: 'saved_view_share_forbidden',
      message: 'only editors or higher can create or change saved views shared with the project',
    });
}

/**
 * Runの一覧の保存ビュー。非公開のビューは個人の表示の設定で、所有者だけが見え、監査に記録しない。
 * Projectに共有したビューは、ほかのメンバーが開くものを変えるので、作成・更新・削除を、拒んだ
 * ものも含めて監査に記録する。
 */
export class SavedViewService {
  constructor(private readonly database: Database) {}

  async list(
    principal: Principal,
    projectId: string,
    query: SavedViewListQuery,
  ): Promise<{ items: SavedView[] }> {
    await requireProject(this.database, principal, {
      projectId,
      role: 'viewer',
      scope: 'read',
    });
    return {
      items: await listVisibleSavedViews(this.database, {
        projectId,
        page: query.page,
        viewerUserId: principal.user.id,
      }),
    };
  }

  async get(principal: Principal, reference: SavedViewReference): Promise<SavedView> {
    await requireProject(this.database, principal, {
      projectId: reference.projectId,
      role: 'viewer',
      scope: 'read',
    });
    return this.requireVisible(this.database, principal, reference);
  }

  async create(
    principal: Principal,
    projectId: string,
    input: SavedViewCreateInput,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<SavedView> {
    const draft = this.auditDraft(principal, {
      action: 'saved_view.create',
      projectId,
      savedViewId: null,
      request,
    });
    const shared = input.visibility === 'project';
    return this.auditSharedDenial(
      draft,
      () => shared,
      () =>
        transaction(this.database, async (connection) => {
          rejectJobToken(principal);
          const role = await requireProject(connection, principal, {
            projectId,
            role: 'viewer',
            scope: SAVED_VIEW_WRITE_SCOPE,
          });
          if (shared) requireSharingRole(role);
          const state = validateSavedViewState(input.state);
          await this.requireProjectExperiments(connection, {
            projectId,
            experimentIds: state.experimentIds,
          });
          const view = await rejectNameConflict(
            insertSavedView(connection, {
              projectId,
              ownerUserId: principal.user.id,
              visibility: input.visibility,
              page: input.page,
              name: input.name,
              state,
            }),
          );
          if (shared)
            await writeAuditEvent(connection, {
              ...draft,
              outcome: 'success',
              resourceId: view.id,
              details: { name: view.name, page: view.page },
            });
          return view;
        }),
    );
  }

  async update(
    principal: Principal,
    reference: SavedViewReference & { patch: SavedViewPatchInput },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<SavedView> {
    const { patch } = reference;
    const draft = this.auditDraft(principal, {
      action: 'saved_view.update',
      ...reference,
      request,
    });
    // ビューを読み込んでから分かる。共有されたビューへの操作を拒んだら監査に記録する。
    let shared = patch.visibility === 'project';
    return this.auditSharedDenial(
      draft,
      () => shared,
      () =>
        transaction(this.database, async (connection) => {
          const { view, role } = await this.lockForChange(connection, principal, reference);
          shared ||= view.visibility === 'project';
          const visibility = patch.visibility ?? view.visibility;
          const isOwner = view.ownerUserId === principal.user.id;
          if (!isOwner) {
            this.requireProjectAdmin(role);
            // ビューを誰が見られるかは所有者が決める。adminは共有されたビューを整えたり
            // 削除したりできる。
            if (visibility !== view.visibility)
              throw new DomainError({
                status: 403,
                code: 'saved_view_owner_required',
                message: 'only the creator can change who a saved view is shared with',
              });
          } else if (visibility === 'project') requireSharingRole(role);
          const state =
            patch.state === undefined ? view.state : validateSavedViewState(patch.state);
          if (patch.state !== undefined)
            await this.requireProjectExperiments(connection, {
              projectId: reference.projectId,
              experimentIds: state.experimentIds,
            });
          const updated = await rejectNameConflict(
            updateSavedView(connection, {
              savedViewId: view.id,
              name: patch.name ?? view.name,
              state,
              visibility,
            }),
          );
          if (shared)
            await writeAuditEvent(connection, {
              ...draft,
              outcome: 'success',
              details: {
                name: updated.name,
                changedFields: Object.keys(patch).filter(
                  (field) => patch[field as keyof SavedViewPatchInput] !== undefined,
                ),
                previousVisibility: view.visibility,
                visibility,
                byOwner: isOwner,
              },
            });
          return updated;
        }),
    );
  }

  async delete(
    principal: Principal,
    reference: SavedViewReference,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const draft = this.auditDraft(principal, {
      action: 'saved_view.delete',
      ...reference,
      request,
    });
    let shared = false;
    await this.auditSharedDenial(
      draft,
      () => shared,
      () =>
        transaction(this.database, async (connection) => {
          const { view, role } = await this.lockForChange(connection, principal, reference);
          shared = view.visibility === 'project';
          // 所有者は、editorのroleを失ったあとでも、自分のビューをいつでも削除できる。
          const isOwner = view.ownerUserId === principal.user.id;
          if (!isOwner) this.requireProjectAdmin(role);
          await deleteSavedView(connection, view.id);
          if (shared)
            await writeAuditEvent(connection, {
              ...draft,
              outcome: 'success',
              details: { name: view.name, byOwner: isOwner },
            });
        }),
    );
  }

  private auditDraft(
    principal: Principal,
    event: {
      action: string;
      projectId: string;
      savedViewId: string | null;
      request: RequestMetadata;
    },
  ): AuditEventDraft {
    return {
      ...auditActor(principal),
      ...event.request,
      action: event.action,
      resourceType: 'saved_view',
      resourceId: event.savedViewId,
      projectId: event.projectId,
    };
  }

  /**
   * auditService.recordDenialと同じだが、共有されたビューだけを対象にする。共有されているかは
   * 操作の中でビューを読み込んでから分かることがあるので、条件はあとで読む。
   */
  private async auditSharedDenial<T>(
    draft: AuditEventDraft,
    isShared: () => boolean,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DomainError && DENIED_STATUSES.has(error.status) && isShared())
        await writeAuditEvent(this.database, {
          ...draft,
          outcome: 'denied',
          details: { ...draft.details, code: error.code },
        });
      throw error;
    }
  }

  private async lockForChange(
    connection: Connection,
    principal: Principal,
    reference: SavedViewReference,
  ): Promise<{ view: SavedView; role: ProjectRole }> {
    rejectJobToken(principal);
    const role = await requireProject(connection, principal, {
      projectId: reference.projectId,
      role: 'viewer',
      scope: SAVED_VIEW_WRITE_SCOPE,
    });
    const view = await this.requireVisible(connection, principal, {
      ...reference,
      lock: true,
    });
    return { view, role };
  }

  // ほかのメンバーの非公開のビューは、存在が知られないよう、無いものとして報告する。
  private async requireVisible(
    connection: Connection,
    principal: Principal,
    reference: SavedViewReference & { lock?: boolean },
  ): Promise<SavedView> {
    const view = await findSavedView(connection, reference);
    if (!view || (view.visibility === 'private' && view.ownerUserId !== principal.user.id))
      notFound('saved view');
    return view;
  }

  private requireProjectAdmin(role: ProjectRole): void {
    if (role !== 'admin')
      throw new DomainError({
        status: 403,
        code: 'saved_view_owner_required',
        message: 'only project admins can change or delete saved views of others',
      });
  }

  // ビューは実験をIDで参照する。別のProjectの実験では、どのRunにも一致しない。
  private async requireProjectExperiments(
    connection: Connection,
    view: { projectId: string; experimentIds: string[] },
  ): Promise<void> {
    if (!view.experimentIds.length) return;
    const found = await first<{ count: number }>(
      connection,
      'SELECT count(*)::int AS count FROM experiments WHERE project_id=$1 AND id=ANY($2::uuid[])',
      [view.projectId, view.experimentIds],
    );
    if (found!.count !== new Set(view.experimentIds).size)
      throw new DomainError({
        status: 422,
        code: 'saved_view_experiment_not_found',
        message: 'the experiment of the saved view is not in this project',
      });
  }
}
