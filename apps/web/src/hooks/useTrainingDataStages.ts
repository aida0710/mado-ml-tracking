import type { Run } from '@mmt/contracts';
import { trainingApi } from '../api/training';
import { useQuery, EXECUTION_POLL_MS } from './useQuery';
import { isTerminalRun } from '../lib/runOutputRegistrationState';

export function useTrainingDataStages(run: Run) {
  return useQuery(
    `${run.projectId}:training-data-stages:${run.id}`,
    (signal) => trainingApi.stages(run.projectId, run.id, signal),
    isTerminalRun(run) ? undefined : EXECUTION_POLL_MS,
  );
}
