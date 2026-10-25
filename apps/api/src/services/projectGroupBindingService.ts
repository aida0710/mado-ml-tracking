import type { ProjectGroupBinding, ProjectRole } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { notFound } from '../domain/errors.js';
import { assertKeepsProjectAdmin } from '../domain/projectAdminInvariant.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { lockProjectAdminGrants } from '../repositories/identityRepository.js';
import {
  deleteGroupBinding,
  findGroupBinding,
  listGroupBindings,
  upsertGroupBinding,
} from '../repositories/projectGroupBindingRepository.js';
import { requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';

// SSOのグループに付与したProjectのrole。各利用者の実効のroleは、直接の付与とこれらの
// 割り当てのうち最も強いもの（effective_project_roles）。
export class ProjectGroupBindingService {
  constructor(private readonly database: Database) {}

  async list(principal: Principal, projectId: string): Promise<ProjectGroupBinding[]> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return listGroupBindings(this.database, projectId);
  }

  async set(
    principal: Principal,
    binding: { projectId: string; group: string; role: ProjectRole },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<ProjectGroupBinding> {
    const { projectId, group, role } = binding;
    const draft = bindingAuditDraft(principal, request, {
      action: 'project.group_binding.set',
      projectId,
      group,
    });
    return recordDenial(this.database, { ...draft, details: { group, role } }, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, { projectId, role: 'admin', scope: 'admin' });
        const adminGrants = await lockProjectAdminGrants(connection, projectId);
        const previous = await findGroupBinding(connection, { projectId, group });
        assertKeepsProjectAdmin(adminGrants, { kind: 'group_binding', groupName: group, role });
        const saved = await upsertGroupBinding(connection, {
          projectId,
          group,
          role,
          createdBy: principal.user.id,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { group, previousRole: previous?.role ?? null, role },
        });
        return saved;
      }),
    );
  }

  async delete(
    principal: Principal,
    binding: { projectId: string; group: string },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const { projectId, group } = binding;
    const draft = bindingAuditDraft(principal, request, {
      action: 'project.group_binding.delete',
      projectId,
      group,
    });
    await recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, { projectId, role: 'admin', scope: 'admin' });
        const adminGrants = await lockProjectAdminGrants(connection, projectId);
        const previous = await findGroupBinding(connection, { projectId, group });
        if (!previous) notFound('group binding');
        assertKeepsProjectAdmin(adminGrants, { kind: 'group_binding', groupName: group, role: null });
        await deleteGroupBinding(connection, { projectId, group });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { group, previousRole: previous.role },
        });
      }),
    );
  }
}

function bindingAuditDraft(
  principal: Principal,
  request: RequestMetadata,
  event: { action: string; projectId: string; group: string },
): AuditEventDraft {
  return {
    ...auditActor(principal),
    ...request,
    action: event.action,
    resourceType: 'project_group_binding',
    resourceId: event.group,
    projectId: event.projectId,
    details: { group: event.group },
  };
}
