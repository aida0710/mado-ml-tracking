import type { Run } from '@mmt/contracts';
import { StatusBadge } from '../StatusBadge';
import { isSweepEarlyStoppedRun } from '../../lib/sweepEarlyStop';

/** Runの状態のバッジ。早期終了したSweepの試行は、Sweepの画面と同じ名前で出す。 */
export function RunStatusBadge({ run }: { run: Pick<Run, 'status' | 'tags'> }) {
  return <StatusBadge status={run.status} earlyStopped={isSweepEarlyStoppedRun(run)} />;
}
