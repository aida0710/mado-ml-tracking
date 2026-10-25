import { executionApi } from '../api/execution';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * Every Project's workers, for a global administrator looking at a computer in 全体設定: whether
 * any worker takes its Jobs and its connection check. Others may not list them (`enabled`).
 */
export function useAllWorkers(enabled: boolean) {
  return useQuery({
    key: enabled ? 'all-workers' : null,
    load: (signal) => executionApi.allWorkers(signal),
    pollMs: EXECUTION_POLL_MS,
  });
}
