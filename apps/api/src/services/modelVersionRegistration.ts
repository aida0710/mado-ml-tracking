import type { JsonObject, Model, ModelVersion } from '@mmt/contracts';
import type { PoolClient } from 'pg';
import type { Principal } from '../auth/principal.js';
import { first, type Connection } from '../db/database.js';
import { validateCodeCompatibility } from '../domain/compatibility.js';
import { DomainError } from '../domain/errors.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import { lockOutputSourceRun } from '../repositories/modelOutputSourceRepository.js';
import { reserveModelVersion } from '../repositories/modelVersionNumbering.js';
import {
  assertProjectReferences,
  findCodeVersion,
  findRun,
} from '../repositories/registryRepository.js';
import { findSavedArtifact } from '../repositories/runtimeArtifactRepository.js';
import { requireProject } from './accessService.js';
import type { ModelAutomationService } from './modelAutomationService.js';
import { enqueueRunEvent } from './outboxEvents.js';

export type ModelVersionRegistrationActor =
  | { type: 'principal'; principal: Principal }
  // Runの完了ハンドラとworkerの出力の宣言は、元のRunの作成者として動く。
  | { type: 'runCreator' };

export interface ModelVersionRegistration {
  projectId: string;
  modelId: string;
  // 省略したときは、models.next_versionから番号を振る。
  version?: string;
  sourceRunId?: string | null;
  parentVersionIds: string[];
  artifactId?: string | null;
  weightsUri?: string | null;
  defaultCodeVersionId?: string | null;
  metadata: JsonObject;
  actor: ModelVersionRegistrationActor;
}

/**
 * 呼び出し元のトランザクションで、変更できないModelVersionを挿入し、モデルの自動実行を始める。
 * 元のRunにはmodel_versionsの外部キーと同じFOR KEY SHAREのロックをかける。MLflowの登録はここで
 * 既にLogged Modelのロックを持っており、Runにより強いロックをかけると、RunをLogged Modelより
 * 先にロックするruns/outputsとデッドロックするため。
 */
export async function registerModelVersion(
  connection: PoolClient,
  registration: ModelVersionRegistration,
  automation: ModelAutomationService,
): Promise<ModelVersion> {
  const { projectId, actor } = registration;
  if (actor.type === 'principal')
    await requireProject(connection, actor.principal, {
      projectId,
      role: 'editor',
      scope: 'registry:write',
    });
  const sourceRun = registration.sourceRunId
    ? await lockOutputSourceRun(connection, { projectId, id: registration.sourceRunId })
    : null;
  if (actor.type === 'runCreator') {
    if (!sourceRun)
      throw new DomainError({
        status: 422,
        code: 'source_run_required',
        message: 'sourceRunId is required to register as the creator of the run',
      });
    await requireRunCreatorRegistryAccess(connection, { projectId, userId: sourceRun.createdBy });
  }
  const version = await reserveModelVersion(connection, {
    projectId,
    modelId: registration.modelId,
    version: registration.version,
  });
  const model = (await first<Pick<Model, 'id' | 'family'>>(
    connection,
    'SELECT id,family FROM models WHERE id=$1',
    [registration.modelId],
  ))!;
  await assertProjectReferences(connection, {
    table: 'model_versions',
    projectId,
    ids: registration.parentVersionIds,
  });
  if (registration.artifactId)
    await findSavedArtifact(connection, { projectId, artifactId: registration.artifactId });
  if (registration.defaultCodeVersionId)
    validateCodeCompatibility(
      await findCodeVersion(connection, { projectId, id: registration.defaultCodeVersionId }),
      { model },
    );
  const inserted = (await first<Omit<ModelVersion, 'family'>>(
    connection,
    `INSERT INTO model_versions(model_id,project_id,version,source_run_id,parent_model_version_ids,weights_uri,artifact_id,default_code_version_id,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      model.id,
      projectId,
      version,
      sourceRun?.id ?? null,
      registration.parentVersionIds,
      registration.weightsUri ?? null,
      registration.artifactId ?? null,
      registration.defaultCodeVersionId ?? null,
      JSON.stringify(registration.metadata),
    ],
  ))!;
  await automation.processRegistration(connection, { projectId, modelVersionId: inserted.id });
  if (sourceRun) {
    // 終了状態への遷移はRunをFOR UPDATEでロックするので、このトランザクションを待って自分で
    // バージョンを並べるか、これより前にコミットしているかのどちらかになる。イベントを送り直す
    // 必要があるのは後者だけ。
    const currentRun = await findRun(connection, { projectId, id: sourceRun.id });
    if (isTerminalStatus(currentRun.status)) await enqueueRunEvent(connection, currentRun);
  }
  return { ...inserted, family: model.family, trainingSourceRunId: inserted.sourceRunId };
}

async function requireRunCreatorRegistryAccess(
  connection: Connection,
  member: { projectId: string; userId: string },
): Promise<void> {
  // システムのactorは、全体管理者がsessionでだけ持つアクセスを引き継がない。group bindingは、
  // ほかのすべての権限の判断と同じく、直接付与と同じに数える。
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
