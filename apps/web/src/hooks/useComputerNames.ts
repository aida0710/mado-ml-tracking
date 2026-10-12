import { useCallback } from 'react';
import type { ComputeTarget } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { computerNameOf } from '../lib/computerNames';
import { useQuery } from './useQuery';
import { text } from '../i18n/catalog';

const NO_KNOWN_COMPUTERS: readonly Pick<ComputeTarget, 'id' | 'name'>[] = [];

/**
 * The name of any computer by its id, for the tables and details of Jobs, arrays, Tasks, hooks and
 * automation rules. `known` are the computers the screen already has (those usable in the
 * Project). A computer that is now someone else's Private one is not among them, but its name is
 * public (全体設定 → コンピュータ), so it comes from GET /targets/overview. Call it once per table
 * and hand the lookup to the rows, so the list is read once and not per row.
 */
export function useComputerNames(
  known: readonly Pick<ComputeTarget, 'id' | 'name'>[] = NO_KNOWN_COMPUTERS,
): (targetId: string) => string {
  const overview = useQuery('compute-target-overview', executionApi.targetOverview);
  const computers = overview.value;
  return useCallback(
    (targetId: string) => computerNameOf({ known, computers, targetId, deletedLabel: text.computerDeleted }),
    [known, computers],
  );
}
