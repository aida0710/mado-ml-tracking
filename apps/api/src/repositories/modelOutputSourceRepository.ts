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
  if (!run) notFound('run');
  if (!isTrainingRunKind(run.kind))
    throw new DomainError({
      status: 422,
      code: 'output_model_kind',
      message: 'the source run of an output model must be a training or finetuning run',
    });
  if (run.lifecycleStage !== 'active')
    throw new DomainError({
      status: 422,
      code: 'source_run_deleted',
      message: 'output models cannot be registered to a deleted run',
    });
  return run;
}
