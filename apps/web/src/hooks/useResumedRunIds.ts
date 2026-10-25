import type { Job } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { collectResumedRunIds } from '../lib/checkpointResume';
import { useQuery, type QueryState } from './useQuery';

// APIの上限の、Runの検索1ページ分。JobとそのRunは一緒に作られるので、最新のRunが最新のJobを
// カバーする。Runがこのページより古いJobには、再開の印を出さない。
const RESUMED_RUN_SEARCH_LIMIT = 500;

/**
 * checkpointから続けたRunのid。そのJobに印を付けるのに使う。Job自身はcheckpointを持たないので、
 * Runの要約を読み、Jobが増えたときだけ検索し直す。
 */
export function useResumedRunIds(
  projectId: string,
  jobs: readonly Job[] | undefined,
): QueryState<Set<string>> {
  const newestJobId = jobs?.[0]?.id;
  return useQuery({
    key: jobs ? `${projectId}:resumed-runs:${jobs.length}:${newestJobId ?? ''}` : null,
    load: async (signal) => {
      const search = { limit: RESUMED_RUN_SEARCH_LIMIT };
      return collectResumedRunIds((await trackingApi.searchRuns(projectId, search, signal)).items);
    },
  });
}
