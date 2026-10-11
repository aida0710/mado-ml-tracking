import type { Job, Run } from '@mmt/contracts';
import type { CreateJob, CreateRun } from '../api/inputs';
import { executionApi } from '../api/execution';
import { useMutation } from './useMutation';

/**
 * Starts a Job: for an existing queued Run (the Run's page), only its Job; otherwise a new Run
 * and its Job at once, so a refused Job leaves no queued Run behind and trying again is safe.
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
