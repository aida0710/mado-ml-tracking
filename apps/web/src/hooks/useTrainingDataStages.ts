import type { Run } from '@mmt/contracts';
import { trainingApi } from '../api/training';
import { useQuery, EXECUTION_POLL_MS } from './useQuery';
import { isTerminalRun } from '../lib/runOutputRegistrationState';

export function useTrainingDataStages(run: Run) {
  return useQuery({
    key: `${run.projectId}:training-data-stages:${run.id}`,
    load: (signal) => trainingApi.stages(run.projectId, run.id, signal),
    pollMs: isTerminalRun(run) ? undefined : EXECUTION_POLL_MS,
  });
}
