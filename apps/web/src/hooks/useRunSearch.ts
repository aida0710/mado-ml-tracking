import type { RunSearchPage, RunSearchRequest } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { RequestError } from '../api/http';
import { formatErrorMessage } from '../lib/errorMessage';
import { EXECUTION_POLL_MS, useQuery, type QueryState } from './useQuery';

// The API's answer to a filter it cannot run (an unsupported field or comparison).
const FILTER_REJECTED_STATUS = 400;
const FILTER_REJECTED_CODE = 'invalid_parameter_value';

type RunSearchOutcome = { page: RunSearchPage } | { rejection: RequestError };

/**
 * One page of the server-side Run search, refreshed while Runs are executing. A filter the API
 * refuses comes back as `filterRejection` instead of an error of `runs`: searching again cannot fix
 * it, so it is shown where the filter is typed rather than with a retry button.
 */
export function useRunSearch(
  projectId: string,
  search: RunSearchRequest,
): { runs: QueryState<RunSearchPage>; filterRejection: string | null } {
  const outcome = useQuery<RunSearchOutcome>(
    `${projectId}:run-search:${JSON.stringify(search)}`,
    async (signal) => {
      try {
        return { page: await trackingApi.searchRuns(projectId, search, signal) };
      } catch (failure) {
        if (
          failure instanceof RequestError &&
          failure.status === FILTER_REJECTED_STATUS &&
          failure.code === FILTER_REJECTED_CODE
        )
          return { rejection: failure };
        throw failure;
      }
    },
    EXECUTION_POLL_MS,
  );
  const result = outcome.value;
  return {
    runs: { ...outcome, value: result && 'page' in result ? result.page : undefined },
    // Put into words on each render (useQuery follows the display language), not when it arrived.
    filterRejection: result && 'rejection' in result ? formatErrorMessage(result.rejection) : null,
  };
}
