import type { Principal } from '../../auth/principal.js';
import { first, transaction, type Database, type Connection } from '../../db/database.js';
import { conflict, DomainError, notFound } from '../../domain/errors.js';
import { requireModelsRead, requireModelsWrite } from './access.js';
import { mutateRegisteredModel } from './modelMutation.js';
import { findRegisteredModel, findModelVersion, activeModelVersions } from './modelRepository.js';
import { registeredModelProtocol, modelVersionProtocol } from './protocol.js';
import {
  keyValueMap,
  invalidParameter,
  unsupported,
  type CreateRegisteredModel,
  type SearchRegistry,
} from './validation.js';
import { searchRegisteredModels, searchModelVersions } from './registrySearch.js';
import type { RegisteredModelRecord } from './types.js';
import { MAX_MODEL_NAME_LENGTH } from './limits.js';
import {
  assignModelAlias,
  modelAliasActor,
  removeModelAliases,
} from '../../repositories/modelAliasRepository.js';
import { mlflowAliasGuard } from '../../services/aliasProtectionService.js';

export class RegisteredModelService {
  constructor(private readonly database: Database) {}

  async create(principal: Principal, projectId: string, input: CreateRegisteredModel) {
    if (input.deployment_job_id) unsupported('deployment jobs are not supported');
    try {
      return await transaction(this.database, async (connection) => {
        await requireModelsWrite(connection, { principal, projectId });
        const tags = keyValueMap(input.tags);
        const family = tags['mmt.model_family'] ?? 'mlflow';
        if (!family || family.length > MAX_MODEL_NAME_LENGTH)
          invalidParameter('invalid mmt.model_family');
        const existing = await first<RegisteredModelRecord>(
          connection,
          `SELECT m.*,mm.deleted_at FROM models m LEFT JOIN mlflow_registered_model_metadata mm ON mm.model_id=m.id
           WHERE m.project_id=$1 AND m.name=$2 FOR UPDATE OF m`,
          [projectId, input.name],
        );
        if (existing && !existing.deletedAt)
          throw new DomainError({
            status: 409,
            code: 'already_exists',
            message: 'a model with the same name is already registered',
          });
        if (existing) {
          if (tags['mmt.model_family'] && family !== existing.family)
            conflict('keep the family of the native model when recreating it');
          await connection.query('UPDATE models SET description=$2 WHERE id=$1', [
            existing.id,
            input.description,
          ]);
          await connection.query(
            'UPDATE mlflow_registered_model_metadata SET deleted_at=NULL,tags=$2,updated_at=now() WHERE model_id=$1',
            [existing.id, JSON.stringify(tags)],
          );
          return registeredModelProtocol(
            await findRegisteredModel(connection, { projectId, name: input.name }),
            [],
          );
        }
        const model = (await first<{ id: string }>(
          connection,
          'INSERT INTO models(project_id,name,family,description) VALUES($1,$2,$3,$4) RETURNING id',
          [projectId, input.name, family, input.description],
        ))!;
        await connection.query(
          'INSERT INTO mlflow_registered_model_metadata(model_id,project_id,tags) VALUES($1,$2,$3)',
          [model.id, projectId, JSON.stringify(tags)],
        );
        return registeredModelProtocol(
          await findRegisteredModel(connection, { projectId, name: input.name }),
          [],
        );
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new DomainError({
          status: 409,
          code: 'already_exists',
          message: 'a model with the same name is already registered',
        });
      throw error;
    }
  }

  async get(principal: Principal, projectId: string, name: string) {
    await requireModelsRead(this.database, { principal, projectId });
    const model = await findRegisteredModel(this.database, { projectId, name });
    return registeredModelProtocol(
      model,
      await activeModelVersions(this.database, { projectId, id: model.id }),
    );
  }

  async search(principal: Principal, projectId: string, input: SearchRegistry) {
    await requireModelsRead(this.database, { principal, projectId });
    return searchRegisteredModels(this.database, projectId, input);
  }

  async searchVersions(principal: Principal, projectId: string, input: SearchRegistry) {
    await requireModelsRead(this.database, { principal, projectId });
    return searchModelVersions(this.database, projectId, input);
  }

  async update(
    principal: Principal,
    projectId: string,
    reference: { name: string; description?: string; deployment_job_id?: string },
  ) {
    if (reference.deployment_job_id) unsupported('deployment jobs are not supported');
    return mutateRegisteredModel(
      this.database,
      { principal, projectId, name: reference.name },
      async (connection, model) => {
        if (reference.description !== undefined)
          await connection.query('UPDATE models SET description=$2 WHERE id=$1', [
            model.id,
            reference.description,
          ]);
        await this.touchMetadata(connection, model);
        return registeredModelProtocol(
          await findRegisteredModel(connection, { projectId, name: reference.name }),
          await activeModelVersions(connection, { projectId, id: model.id }),
        );
      },
    );
  }

  async rename(
    principal: Principal,
    projectId: string,
    reference: { name: string; new_name: string },
  ) {
    return mutateRegisteredModel(
      this.database,
      { principal, projectId, name: reference.name },
      async (connection, model) => {
        await connection.query('UPDATE models SET name=$2 WHERE id=$1', [
          model.id,
          reference.new_name,
        ]);
        await this.touchMetadata(connection, model);
        return registeredModelProtocol(
          await findRegisteredModel(connection, { projectId, name: reference.new_name }),
          await activeModelVersions(connection, { projectId, id: model.id }),
        );
      },
    );
  }

  async delete(principal: Principal, projectId: string, name: string): Promise<void> {
    await mutateRegisteredModel(
      this.database,
      { principal, projectId, name },
      async (connection, model) => {
        await this.touchMetadata(connection, model);
        await connection.query(
          'UPDATE mlflow_registered_model_metadata SET deleted_at=now() WHERE model_id=$1',
          [model.id],
        );
        await connection.query(
          `INSERT INTO mlflow_model_version_metadata(version_id,project_id,artifact_uri,deleted_at)
        SELECT v.id,v.project_id,'',now() FROM model_versions v WHERE v.model_id=$1
        ON CONFLICT(version_id) DO UPDATE SET deleted_at=now(),updated_at=now()`,
          [model.id],
        );
        await removeModelAliases(connection, {
          modelId: model.id,
          actor: modelAliasActor(principal),
          source: 'model_deleted',
          guard: mlflowAliasGuard,
        });
      },
    );
  }

  async setTag(
    principal: Principal,
    projectId: string,
    reference: { name: string; key: string; value?: string },
  ): Promise<void> {
    await mutateRegisteredModel(
      this.database,
      { principal, projectId, name: reference.name },
      async (connection, model) => {
        if (reference.key === 'mmt.model_family' && reference.value !== model.family)
          conflict('mmt.model_family can only be set to the family of the native model');
        await this.touchMetadata(connection, model);
        if (reference.value === undefined)
          await connection.query(
            'UPDATE mlflow_registered_model_metadata SET tags=tags-$2::text WHERE model_id=$1',
            [model.id, reference.key],
          );
        else
          await connection.query(
            'UPDATE mlflow_registered_model_metadata SET tags=tags || $2::jsonb WHERE model_id=$1',
            [model.id, JSON.stringify({ [reference.key]: reference.value })],
          );
      },
    );
  }

  async setAlias(
    principal: Principal,
    projectId: string,
    reference: { name: string; alias: string; version: string },
  ): Promise<void> {
    await mutateRegisteredModel(
      this.database,
      { principal, projectId, name: reference.name },
      async (connection, model) => {
        const version = await findModelVersion(connection, {
          projectId,
          name: reference.name,
          version: reference.version,
        });
        // ネイティブのFKも、aliasを同じModelのバージョンに結びつける。
        await assignModelAlias(connection, {
          modelId: model.id,
          alias: reference.alias,
          versionId: version.id,
          actor: modelAliasActor(principal),
          source: 'mlflow',
          guard: mlflowAliasGuard,
        });
        await this.touchMetadata(connection, model);
      },
    );
  }

  async deleteAlias(
    principal: Principal,
    projectId: string,
    reference: { name: string; alias: string },
  ): Promise<void> {
    await mutateRegisteredModel(
      this.database,
      { principal, projectId, name: reference.name },
      async (connection, model) => {
        await removeModelAliases(connection, {
          modelId: model.id,
          alias: reference.alias,
          actor: modelAliasActor(principal),
          source: 'mlflow',
          guard: mlflowAliasGuard,
        });
        await this.touchMetadata(connection, model);
      },
    );
  }

  async byAlias(
    principal: Principal,
    projectId: string,
    reference: { name: string; alias: string },
  ) {
    await requireModelsRead(this.database, { principal, projectId });
    const model = await findRegisteredModel(this.database, { projectId, name: reference.name });
    const resolved = await first<{ version: string }>(
      this.database,
      'SELECT v.version FROM model_aliases a JOIN model_versions v ON v.id=a.version_id WHERE a.model_id=$1 AND a.alias=$2',
      [model.id, reference.alias],
    );
    if (!resolved) notFound('model alias');
    return modelVersionProtocol(
      await findModelVersion(this.database, {
        projectId,
        name: reference.name,
        version: resolved.version,
      }),
    );
  }

  private async touchMetadata(connection: Connection, model: RegisteredModelRecord): Promise<void> {
    await connection.query(
      `INSERT INTO mlflow_registered_model_metadata(model_id,project_id) VALUES($1,$2)
      ON CONFLICT(model_id) DO UPDATE SET updated_at=now()`,
      [model.id, model.projectId],
    );
  }
}
