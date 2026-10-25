import type { Principal } from '../../auth/principal.js';
import { first, type Connection } from '../../db/database.js';
import { DomainError, notFound } from '../../domain/errors.js';
import { lockProjectRoleSources, userColumns } from '../../repositories/identityRepository.js';
import { isJobTokenActive } from '../../repositories/jobTokenRepository.js';
import { requireProject } from '../../services/accessService.js';
import type { ArtifactAccess } from './artifactTypes.js';

export async function requireArtifactProject(
  connection: Connection,
  access: ArtifactAccess,
  options: { write?: boolean; lock?: boolean } = {},
): Promise<Principal> {
  const lock = options.lock ? 'FOR SHARE' : '';
  const user = await first<Principal['user']>(
    connection,
    `SELECT ${userColumns} FROM users u WHERE u.id=$1 ${lock}`,
    [access.principal.user.id],
  );
  if (!user) throw new DomainError({
    status: 401,
    code: 'authentication_required',
    message: 'the session is invalid',
  });
  let token = access.principal.token;
  if (token?.job) {
    if (!(await isJobTokenActive(connection, { id: token.id, userId: user.id, lock: options.lock })))
      throw new DomainError({
        status: 401,
        code: 'invalid_token',
        message: 'the Job token is invalid or revoked',
      });
  } else if (access.principal.method === 'token') {
    token =
      (await first<NonNullable<Principal['token']>>(
        connection,
        `SELECT id,project_id,scopes FROM api_tokens WHERE id=$1 AND user_id=$2
       AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) ${lock}`,
        [token?.id, user.id],
      )) ?? null;
    if (!token) throw new DomainError({
      status: 401,
      code: 'invalid_token',
      message: 'the API token is invalid or revoked',
    });
  }
  const identity: Principal = { ...access.principal, user, token };
  if (options.lock) {
    await connection.query('SELECT id FROM projects WHERE id=$1 FOR SHARE', [access.projectId]);
    await lockProjectRoleSources(connection, { projectId: access.projectId, userId: user.id });
  }
  await requireProject(connection, identity, {
    projectId: access.projectId,
    role: options.write ? 'editor' : 'viewer',
    scope: options.write ? 'artifacts:write' : 'read',
  });
  return identity;
}

export async function requireArtifactOwner(
  connection: Connection,
  access: ArtifactAccess,
  options: { write?: boolean; lock?: boolean } = {},
): Promise<{ runId: string | null }> {
  const table = access.owner.kind === 'run' ? 'runs' : 'mlflow_logged_models';
  const reference = await first<{ experimentId: string; sourceRunId?: string | null }>(
    connection,
    `SELECT experiment_id${access.owner.kind === 'model' ? ',source_run_id' : ''} FROM ${table} WHERE id=$1 AND project_id=$2`,
    [access.owner.id, access.projectId],
  );
  if (!reference) notFound(access.owner.kind === 'run' ? 'run' : 'logged model');
  // Experiments are locked before owners to serialize with experiment deletion.
  const experiment = await first<{ lifecycleStage: string }>(
    connection,
    `SELECT lifecycle_stage FROM experiments WHERE id=$1 AND project_id=$2 ${options.lock ? 'FOR SHARE' : ''}`,
    [reference.experimentId, access.projectId],
  );
  if (!experiment || experiment.lifecycleStage !== 'active') notFound('experiment');
  // Run outputs lock the source Run before the model. Uploads must follow that same order.
  if (options.write && access.owner.kind === 'model' && reference.sourceRunId) {
    const sourceRun = await first<{ lifecycleStage: string }>(
      connection,
      `SELECT lifecycle_stage FROM runs WHERE id=$1 AND project_id=$2 ${options.lock ? 'FOR NO KEY UPDATE' : ''}`,
      [reference.sourceRunId, access.projectId],
    );
    if (!sourceRun || sourceRun.lifecycleStage !== 'active') notFound('run');
  }
  // Run FK inserts hold KEY SHARE; NO KEY UPDATE avoids an upgrade deadlock between uploads.
  const ownerLock = options.lock
    ? access.owner.kind === 'run'
      ? 'FOR NO KEY UPDATE'
      : 'FOR UPDATE'
    : '';
  const owner = await first<{
    lifecycleStage?: string;
    deletedAt?: string | null;
    status: string;
    sourceRunId?: string | null;
  }>(
    connection,
    `SELECT ${access.owner.kind === 'run' ? 'lifecycle_stage,status' : 'deleted_at,status,source_run_id'}
     FROM ${table} WHERE id=$1 AND project_id=$2 ${ownerLock}`,
    [access.owner.id, access.projectId],
  );
  if (!owner || owner.lifecycleStage === 'deleted' || owner.deletedAt)
    notFound(access.owner.kind === 'run' ? 'run' : 'logged model');
  if (options.write && access.owner.kind === 'model' && owner.status !== 'PENDING')
    throw new DomainError({
      status: 409,
      code: 'conflict',
      message: 'artifacts can be written only to a PENDING logged model',
    });
  const runId = access.owner.kind === 'run' ? access.owner.id : (owner.sourceRunId ?? null);
  if (options.write && access.owner.kind === 'model' && runId !== (reference.sourceRunId ?? null))
    throw new DomainError({
      status: 409,
      code: 'conflict',
      message: 'the source run of the artifact has changed',
    });
  return { runId };
}
