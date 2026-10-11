import { useState } from 'react';
import type { TargetCheckWorker } from '@mmt/contracts';
import { targetChecksApi } from '../api/targetChecks';
import { defaultCheckWorker } from '../lib/checkWorkerChoice';
import { useQuery } from './useQuery';

/**
 * The online workers one may ask to check a computer, and the one chosen: until the person picks
 * one, the worker of the last check if it is online, or the only worker there is.
 */
export function useCheckWorkerChoice(lastUsed: TargetCheckWorker | null) {
  const workers = useQuery('target-check-workers', targetChecksApi.workers);
  const [picked, setPicked] = useState<TargetCheckWorker | null>(null);
  const worker = picked ?? defaultCheckWorker(workers.value ?? [], lastUsed);
  return { workers, worker, choose: setPicked };
}
