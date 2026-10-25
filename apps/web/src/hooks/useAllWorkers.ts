import { executionApi } from '../api/execution';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * 全体管理者が全体設定でコンピュータを見るときの、すべてのProjectのworker。そのコンピュータの
 * Jobと接続確認を引き受けるworkerがいるかを見る。ほかの利用者は一覧を取れない（`enabled`）。
 */
export function useAllWorkers(enabled: boolean) {
  return useQuery({
    key: enabled ? 'all-workers' : null,
    load: (signal) => executionApi.allWorkers(signal),
    pollMs: EXECUTION_POLL_MS,
  });
}
