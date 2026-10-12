import { isTrainingRunKind, type RunKind, type RunStatus } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';

interface OutputSourceRun {
  id: string;
  kind: RunKind;
  status: RunStatus;
  lifecycleStage: 'active' | 'deleted';
  createdBy: string;
}

export async function lockOutputSourceRun(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<OutputSourceRun> {
  const run = await first<OutputSourceRun>(
    connection,
    'SELECT id,kind,status,lifecycle_stage,created_by FROM runs WHERE project_id=$1 AND id=$2 FOR KEY SHARE',
    [reference.projectId, reference.id],
  );
  if (!run) notFound('Run');
  if (!isTrainingRunKind(run.kind))
    throw new DomainError(
      422,
      '出力モデルのsource Runはtrainingまたはfinetuningである必要があります',
      'output_model_kind',
    );
  if (run.lifecycleStage !== 'active')
    throw new DomainError(422, '削除済みRunには出力モデルを登録できません', 'source_run_deleted');
  return run;
}
