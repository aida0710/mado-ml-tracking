import type {
  ArtifactBackend,
  Experiment,
  Project,
  ProjectMember,
  ProjectMemberGrant,
  ProjectRole,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { conflict, DomainError, notFound } from '../domain/errors.js';
import { duplicateExperimentName } from '../domain/experimentNames.js';
import { assertKeepsProjectAdmin } from '../domain/projectAdminInvariant.js';
import { assertGrantableUsers, initialMemberGrants } from '../domain/projectMemberGrants.js';
import type { ProjectCreateInput, ProjectPatchInput } from '../domain/projectValidation.js';
import type { ExperimentPatch } from '../domain/registryLifecycleValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  findDirectRole,
  findMember,
  findUser,
  isProjectMember,
  listMembers,
  listUserStates,
  lockProjectAdminGrants,
} from '../repositories/identityRepository.js';
import {
  archiveProject,
  hasActiveJobs,
  insertProject,
  lockProjectLifecycle,
  PROJECT_COLUMNS,
  updateProject,
} from '../repositories/projectRepository.js';
import { requireProject, requireScope } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';

const experimentSelect =
  "SELECT e.*, (SELECT count(*) FROM runs r WHERE r.experiment_id=e.id AND r.lifecycle_stage='active') AS run_count FROM experiments e";

export class ProjectService {
  constructor(
    private readonly database: Database,
    private readonly backends: () => ArtifactBackend[],
  ) {}

  async list(principal: Principal): Promise<Project[]> {
    requireScope(principal, 'read');
    return this.selectOpenableProjects(principal, principal.token?.projectId ?? null);
  }

  /**
   * GET /projectsの一覧と同じ形のProject1件（GET /projects/:p）。利用者が開けないProjectは、
   * アーカイブされたものも含めて、開けない理由を返す（requireProject）。
   */
  async get(principal: Principal, projectId: string): Promise<Project> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    const [project] = await this.selectOpenableProjects(principal, projectId);
    if (!project) notFound('project');
    return project;
  }

  private selectOpenableProjects(
    principal: Principal,
    onlyProjectId: string | null,
  ): Promise<Project[]> {
    // 全体管理者のsessionは、アーカイブされていないすべてのProjectをadminとして見る
    // （requireProjectと一致する）。isMemberは、利用者が入れてもらったProjectと、誰にでも
    // 公開されたProjectを見分ける。
    return rows<Project>(
      this.database,
      `SELECT ${PROJECT_COLUMNS},CASE WHEN $2 THEN 'admin' ELSE e.role END AS role,
        m.role IS NOT NULL AS is_member FROM projects p
      LEFT JOIN effective_project_roles e ON e.project_id=p.id AND e.user_id=$1
      LEFT JOIN project_membership_roles m ON m.project_id=p.id AND m.user_id=$1
      WHERE p.archived_at IS NULL AND (e.role IS NOT NULL OR $2) AND ($3::uuid IS NULL OR p.id=$3)
      ORDER BY p.created_at DESC`,
      [principal.user.id, principal.method === 'session' && principal.user.isAdmin, onlyProjectId],
    );
  }

  /**
   * 作成者がProject adminになる。リクエストで指定したメンバーは同じトランザクションで加え、
   * それぞれPUT /membersと同じように監査に記録する。そのため、拒まれたメンバーがいればProjectも
   * 残らない。
   */
  async create(
    principal: Principal,
    input: ProjectCreateInput,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<Project> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'project.create',
      resourceType: 'project',
      details: { name: input.name, visibility: input.visibility },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        requireScope(principal, 'admin');
        if (principal.token?.projectId)
          throw new DomainError({
            status: 403,
            code: 'project_forbidden',
            message: 'a token limited to a project cannot create projects',
          });
        this.validateBackend(input.artifactBackend);
        const grants = initialMemberGrants(input.members, principal.user.id);
        assertGrantableUsers(
          grants,
          await listUserStates(
            connection,
            grants.map((grant) => grant.userId),
          ),
        );
        const project = await insertProject(connection, input);
        const projectDraft = { ...draft, resourceId: project.id, projectId: project.id };
        await connection.query(
          "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'admin')",
          [project.id, principal.user.id],
        );
        await this.grantInitialMembers(connection, { grants, draft: projectDraft });
        await writeAuditEvent(connection, {
          ...projectDraft,
          outcome: 'success',
          details: {
            ...draft.details,
            artifactBackend: input.artifactBackend,
            memberCount: grants.length,
          },
        });
        return { ...project, role: 'admin', isMember: true };
      }),
    );
  }

  async patch(
    principal: Principal,
    change: { projectId: string; input: ProjectPatchInput },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<Project> {
    const { projectId, input } = change;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'project.update',
      resourceType: 'project',
      resourceId: projectId,
      projectId,
      details: { fields: Object.keys(input) },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        const role = await requireProject(connection, principal, {
          projectId,
          role: 'admin',
          scope: 'admin',
        });
        if (input.artifactBackend) this.validateBackend(input.artifactBackend);
        const project = await updateProject(connection, { projectId, ...input });
        const isMember = await isProjectMember(connection, {
          projectId,
          userId: principal.user.id,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            ...draft.details,
            ...(input.visibility ? { visibility: input.visibility } : {}),
            ...(input.artifactBackend ? { artifactBackend: input.artifactBackend } : {}),
          },
        });
        return { ...project, role, isMember };
      }),
    );
  }

  /**
   * Projectを全員から隠し、データは残す（POST /projects/:p/archive）。全体管理者が復元するか
   * 完全に削除する（ProjectAdministrationService）。Jobが順番待ちか実行中の間は拒む。アーカイブ
   * すると、そのJobを見ることも止めることもできなくなるため。
   */
  async archive(
    principal: Principal,
    projectId: string,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'project.archive',
      resourceType: 'project',
      resourceId: projectId,
      projectId,
    };
    await recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, { projectId, role: 'admin', scope: 'admin' });
        // Jobの作成はこの行のロックを共有で取る（shareLiveProject）ので、確認のあとで
        // Jobは増えない。
        const project = await lockProjectLifecycle(connection, projectId);
        // requireProjectがProjectを読んだあとで、別のアーカイブがコミットされていることがある。
        if (!project || project.archivedAt) notFound('project');
        if (await hasActiveJobs(connection, projectId))
          throw new DomainError({
            status: 409,
            code: 'project_has_active_jobs',
            message: 'a project with waiting or running jobs cannot be archived',
          });
        await archiveProject(connection, { projectId, archivedBy: principal.user.id });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { name: project.name },
        });
      }),
    );
  }

  async members(principal: Principal, projectId: string): Promise<ProjectMember[]> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return listMembers(this.database, projectId);
  }

  // 直接の付与だけを設定する。グループの割り当てはProjectGroupBindingServiceが管理する。
  async setMember(
    principal: Principal,
    membership: { projectId: string; userId: string; role: ProjectRole },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<ProjectMember> {
    const { projectId, userId, role } = membership;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'project.member.set',
      resourceType: 'project_member',
      resourceId: userId,
      projectId,
      details: { userId, role },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, { projectId, role: 'admin', scope: 'admin' });
        const adminGrants = await lockProjectAdminGrants(connection, projectId);
        const user = await findUser(connection, userId);
        if (!user) notFound('user');
        const previousRole = await findDirectRole(connection, { projectId, userId });
        assertKeepsProjectAdmin(adminGrants, { kind: 'member', userId, role });
        await connection.query(
          'INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(project_id,user_id) DO UPDATE SET role=EXCLUDED.role',
          [projectId, userId, role],
        );
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { userId, previousRole, role },
        });
        return (await findMember(connection, { projectId, userId }))!;
      }),
    );
  }

  // 直接の付与を外す。割り当てたグループにも入っている利用者は、そのroleを持ち続ける。
  async removeMember(
    principal: Principal,
    membership: { projectId: string; userId: string },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const { projectId, userId } = membership;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'project.member.delete',
      resourceType: 'project_member',
      resourceId: userId,
      projectId,
      details: { userId },
    };
    await recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, { projectId, role: 'admin', scope: 'admin' });
        const adminGrants = await lockProjectAdminGrants(connection, projectId);
        const previousRole = await findDirectRole(connection, { projectId, userId });
        if (!previousRole) notFound('project member');
        assertKeepsProjectAdmin(adminGrants, { kind: 'member', userId, role: null });
        await connection.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [
          projectId,
          userId,
        ]);
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { userId, previousRole },
        });
      }),
    );
  }

  async experiments(principal: Principal, projectId: string): Promise<Experiment[]> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return rows<Experiment>(
      this.database,
      `${experimentSelect} WHERE project_id=$1 AND e.lifecycle_stage='active' ORDER BY e.created_at DESC`,
      [projectId],
    );
  }

  // 削除した（MLflowで論理削除した）実験は、一覧と同じくここでも隠す。
  async experiment(
    principal: Principal,
    projectId: string,
    experimentId: string,
  ): Promise<Experiment> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    const experiment = await first<Experiment>(
      this.database,
      `${experimentSelect} WHERE e.project_id=$1 AND e.id=$2 AND e.lifecycle_stage='active'`,
      [projectId, experimentId],
    );
    if (!experiment) notFound('experiment');
    return experiment;
  }

  /**
   * 実験を作るときと同じscope（runs:write）を使う。名前はProjectの中で一意に保つ。ロックの順
   * （Project、次に実験）は、MLflowの名前の変更やArtifactのPUTと同じ。
   */
  async updateExperiment(
    principal: Principal,
    change: { projectId: string; experimentId: string; input: ExperimentPatch },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<Experiment> {
    const { projectId, experimentId, input } = change;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'experiment.update',
      resourceType: 'experiment',
      resourceId: experimentId,
      projectId,
      details: { fields: Object.keys(input), ...(input.name ? { name: input.name } : {}) },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, {
          projectId,
          role: 'editor',
          scope: 'runs:write',
        });
        await connection.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
        const current = await first<{ name: string; lifecycleStage: string }>(
          connection,
          'SELECT name,lifecycle_stage FROM experiments WHERE project_id=$1 AND id=$2 FOR UPDATE',
          [projectId, experimentId],
        );
        if (!current) notFound('experiment');
        if (current.lifecycleStage !== 'active') conflict('a deleted experiment cannot be changed');
        if (input.name !== undefined && input.name !== current.name) {
          const duplicate = await first(
            connection,
            'SELECT id FROM experiments WHERE project_id=$1 AND name=$2 AND id<>$3',
            [projectId, input.name, experimentId],
          );
          if (duplicate) duplicateExperimentName();
        }
        await connection.query(
          'UPDATE experiments SET name=COALESCE($2,name),description=COALESCE($3,description),updated_at=now() WHERE id=$1',
          [experimentId, input.name ?? null, input.description ?? null],
        );
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            ...draft.details,
            ...(input.name !== undefined ? { previousName: current.name } : {}),
          },
        });
        return (await first<Experiment>(connection, `${experimentSelect} WHERE e.id=$1`, [
          experimentId,
        ]))!;
      }),
    );
  }

  async createExperiment(
    principal: Principal,
    projectId: string,
    input: { name: string; description: string },
  ): Promise<Experiment> {
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      // SDKからの作成と名前の変更もProjectをロックし、名前が重ならないようにしている。
      await connection.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
      const duplicate = await first(
        connection,
        'SELECT id FROM experiments WHERE project_id=$1 AND name=$2',
        [projectId, input.name],
      );
      if (duplicate) duplicateExperimentName();
      return (await first<Experiment>(
        connection,
        'INSERT INTO experiments(project_id,name,description) VALUES($1,$2,$3) RETURNING *,0 AS run_count',
        [projectId, input.name, input.description],
      ))!;
    });
  }

  // 付与ごとに、PUT /projects/:p/members/:userIdと同じ形で監査に記録する。
  private async grantInitialMembers(
    connection: Connection,
    creation: { grants: readonly ProjectMemberGrant[]; draft: AuditEventDraft },
  ): Promise<void> {
    const { draft } = creation;
    for (const { userId, role } of creation.grants) {
      await connection.query(
        'INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3)',
        [draft.projectId, userId, role],
      );
      await writeAuditEvent(connection, {
        ...draft,
        action: 'project.member.set',
        resourceType: 'project_member',
        resourceId: userId,
        outcome: 'success',
        details: { userId, previousRole: null, role },
      });
    }
  }

  private validateBackend(backend: ArtifactBackend): void {
    if (!this.backends().includes(backend))
      throw new DomainError({
        status: 422,
        code: 'backend_unavailable',
        message: 'artifact storage is not configured',
      });
  }
}
