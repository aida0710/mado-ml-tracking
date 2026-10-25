import type { Job, Run } from '@mmt/contracts';
import type { CreateJob, CreateRun } from '../api/inputs';
import { executionApi } from '../api/execution';
import { useMutation } from './useMutation';

/**
 * Jobを始める。キューに入っている既存のRun（Runのページ）ならJobだけを、それ以外は新しいRunと
 * そのJobを一度に作る。こうするとJobが断られてもキューに入ったRunが残らず、やり直しても安全。
 */
export function useLaunch(projectId: string, existingRun?: Run) {
  const mutation = useMutation();
  async function launch(input: {
    run: CreateRun;
    job: Omit<CreateJob, 'runId'>;
  }): Promise<Job | undefined> {
    return mutation.run(async () =>
      existingRun
        ? executionApi.createJob(projectId, { ...input.job, runId: existingRun.id })
        : (await executionApi.launchJob(projectId, input)).job,
    );
  }
  return { ...mutation, launch };
}
