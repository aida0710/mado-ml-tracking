import { useState } from 'react';
import type { TargetCheckWorker } from '@mmt/contracts';
import { targetChecksApi } from '../api/targetChecks';
import { defaultCheckWorker } from '../lib/checkWorkerChoice';
import { useQuery } from './useQuery';

/**
 * コンピュータの確認を頼めるオンラインのworkerと、選んだworker。利用者が選ぶまでは、前回の確認の
 * workerがオンラインならそれ、そうでなければworkerが1つだけのときはそれ。
 */
export function useCheckWorkerChoice(lastUsed: TargetCheckWorker | null) {
  const workers = useQuery({ key: 'target-check-workers', load: targetChecksApi.workers });
  const [picked, setPicked] = useState<TargetCheckWorker | null>(null);
  const worker = picked ?? defaultCheckWorker(workers.value ?? [], lastUsed);
  return { workers, worker, choose: setPicked };
}
