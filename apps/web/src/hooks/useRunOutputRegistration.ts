import { useState } from 'react';
import type { Run } from '@mmt/contracts';
import { tasksApi } from '../api/tasks';
import { hasOutputModel } from '../lib/taskInput';
import { getRunOutputRegistrationState, isTerminalRun } from '../lib/runOutputRegistrationState';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * 結果はRunが終わった後にしか無いので、それ以降に取得する。起動時の出力の設定を持つRunでは、
 * APIが結果を記録するまでポーリングする。
 */
export function useRunOutputRegistration(run: Run) {
  const [hasOutcome, setHasOutcome] = useState(false);
  const isExpected = !!run.outputModelRegistration && !hasOutcome;
  const query = useQuery({
    key: hasOutputModel(run.kind) && isTerminalRun(run) ? `${run.projectId}:${run.id}:output-registration` : null,
    load: async (signal) => {
      const registration = await tasksApi.runOutputRegistration(run.projectId, run.id, signal);
      if (registration) setHasOutcome(true);
      return registration;
    },
    pollMs: isExpected ? EXECUTION_POLL_MS : undefined,
  });
  return { state: getRunOutputRegistrationState(run, query.value), error: query.error };
}
