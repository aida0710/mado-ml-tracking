import { EXPLICIT_TOKEN_SCOPES, type ProjectRole, type TokenScope } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, type Connection } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { satisfiesProjectRole } from '../domain/projectRoles.js';
import { scopeRequiredError, tokenProjectMismatchError } from '../domain/tokenAccessErrors.js';

/**
 * Whether the principal may act with `scope`. A browser session is limited by roles alone; a token
 * needs the scope itself or `admin`, which stands for every scope except the explicit ones.
 */
export function holdsScope(principal: Principal, scope: string): boolean {
  if (principal.method === 'session') return true;
  const scopes = principal.token?.scopes ?? [];
  if (scopes.includes(scope)) return true;
  return scopes.includes('admin') && !EXPLICIT_TOKEN_SCOPES.includes(scope as TokenScope);
}

export function requireScope(principal: Principal, scope: string): void {
  if (!holdsScope(principal, scope)) throw scopeRequiredError(scope);
}

export async function requireProject(
  connection: Connection,
  principal: Principal,
  permission: { projectId: string; role: ProjectRole; scope: string },
): Promise<ProjectRole> {
  const { projectId } = permission;
  requireScope(principal, permission.scope);
  if (principal.token?.projectId && principal.token.projectId !== projectId) {
    // The token's own Project is named so the person can tell which settings were mixed up; the
    // token already gives access to that Project, so its name reveals nothing new.
    const tokenProject = await first<{ name: string }>(
      connection,
      'SELECT name FROM projects WHERE id=$1',
      [principal.token.projectId],
    );
    throw tokenProjectMismatchError(tokenProject?.name ?? null);
  }
  // The effective role is the strongest of the direct grant, the user's group bindings and, on a
  // public Project, editor. An archived Project is gone for everyone, global administrators too.
  const membership = await first<{ role: ProjectRole | null }>(
    connection,
    `SELECT e.role FROM projects p LEFT JOIN effective_project_roles e ON e.project_id=p.id AND e.user_id=$2
    WHERE p.id=$1 AND p.archived_at IS NULL`,
    [projectId, principal.user.id],
  );
  if (!membership) return refuseMissingProject(connection, principal, projectId);
  // A global administrator's session is admin in every live Project, also where public access or
  // a weaker grant gives a role. Token access always requires current membership, including a
  // global administrator's tokens.
  const role = principal.method === 'session' && principal.user.isAdmin ? 'admin' : membership.role;
  if (!role || !satisfiesProjectRole(role, permission.role))
    throw new DomainError({
      status: 403,
      code: 'project_forbidden',
      message: 'insufficient project permission',
    });
  return role;
}

const PROJECT_ARCHIVED_MESSAGE =
  'this project is archived; a global administrator can restore it under Administration > Projects';

/**
 * An archived Project is gone, but those who could open it before (its members and global
 * administrators' sessions) are told it was archived, so they ask for it back instead of hunting
 * for a wrong URL. Anyone else cannot tell it from a Project that never existed.
 */
async function refuseMissingProject(
  connection: Connection,
  principal: Principal,
  projectId: string,
): Promise<never> {
  const archived = await first<{ id: string }>(
    connection,
    `SELECT p.id FROM projects p
    WHERE p.id=$1 AND p.archived_at IS NOT NULL AND p.purged_at IS NULL AND ($3 OR EXISTS (
      SELECT 1 FROM project_membership_roles m WHERE m.project_id=p.id AND m.user_id=$2))`,
    [projectId, principal.user.id, principal.method === 'session' && principal.user.isAdmin],
  );
  if (archived) throw new DomainError({
    status: 404,
    code: 'project_archived',
    message: PROJECT_ARCHIVED_MESSAGE,
  });
  notFound('project');
}

export function requireGlobalAdmin(principal: Principal): void {
  requireScope(principal, 'admin');
  if (!principal.user.isAdmin || principal.token?.projectId)
    throw new DomainError({
      status: 403,
      code: 'admin_required',
      message: 'administrator permission required',
    });
}

export async function requireWorker(
  connection: Connection,
  principal: Principal,
): Promise<{ projectId: string; tokenId: string }> {
  if (
    principal.method !== 'token' ||
    !principal.token?.projectId ||
    !principal.token.scopes.includes('worker:execute')
  ) {
    throw new DomainError({
      status: 403,
      code: 'worker_token_required',
      message: 'a worker token limited to a project is required',
    });
  }
  await requireProject(connection, principal, {
    projectId: principal.token.projectId,
    role: 'editor',
    scope: 'worker:execute',
  });
  return { projectId: principal.token.projectId, tokenId: principal.token.id };
}

// Descriptions and comments are human records, so code running inside a Job may not write them.
export function rejectJobToken(principal: Principal): void {
  if (principal.token?.job)
    throw new DomainError({
      status: 403,
      code: 'job_token_forbidden',
      message: 'this operation is not allowed with a Job token',
    });
}
