import type { CommentTargetType } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';
import { DomainError } from '../domain/errors.js';

export type CommentTargetState = 'active' | 'deleted';

/**
 * 1種類の対象へのコメントの付け方。findStateは、対象がProjectに無ければundefinedを返す。また、
 * トランザクションの途中で削除されないよう、対象の行をロックすること。
 */
export interface CommentTargetDefinition {
  writeScope: string;
  findState(
    connection: Connection,
    target: { projectId: string; targetId: string },
  ): Promise<CommentTargetState | undefined>;
}

export class CommentTargetRegistry {
  private readonly definitions = new Map<CommentTargetType, CommentTargetDefinition>();

  // レポートは自分のサービスが登録するので、ここからはそのテーブルを参照しない。
  registerCommentTarget(targetType: CommentTargetType, definition: CommentTargetDefinition): void {
    if (this.definitions.has(targetType))
      throw new Error(`Comment target already registered: ${targetType}`);
    this.definitions.set(targetType, definition);
  }

  definition(targetType: CommentTargetType): CommentTargetDefinition {
    const definition = this.definitions.get(targetType);
    if (!definition)
      throw new DomainError({
        status: 422,
        code: 'comment_target_unsupported',
        message: 'this kind of target cannot be commented on yet',
      });
    return definition;
  }
}

const runTarget: CommentTargetDefinition = {
  writeScope: 'runs:write',
  async findState(connection, target) {
    const run = await first<{ lifecycleStage: CommentTargetState }>(
      connection,
      'SELECT lifecycle_stage FROM runs WHERE id=$1 AND project_id=$2 FOR SHARE',
      [target.targetId, target.projectId],
    );
    return run?.lifecycleStage;
  },
};

// バージョンかその登録モデルがMLflowのレジストリで削除されていれば、そのバージョンは削除済み。
const modelVersionTarget: CommentTargetDefinition = {
  writeScope: 'registry:write',
  async findState(connection, target) {
    const version = await first<{ deleted: boolean }>(
      connection,
      `SELECT (vm.deleted_at IS NOT NULL OR mm.deleted_at IS NOT NULL) AS deleted
      FROM model_versions v
      LEFT JOIN mlflow_model_version_metadata vm ON vm.version_id=v.id
      LEFT JOIN mlflow_registered_model_metadata mm ON mm.model_id=v.model_id
      WHERE v.id=$1 AND v.project_id=$2 FOR SHARE OF v`,
      [target.targetId, target.projectId],
    );
    if (!version) return undefined;
    return version.deleted ? 'deleted' : 'active';
  },
};

export function createCommentTargetRegistry(): CommentTargetRegistry {
  const registry = new CommentTargetRegistry();
  registry.registerCommentTarget('run', runTarget);
  registry.registerCommentTarget('model_version', modelVersionTarget);
  return registry;
}
