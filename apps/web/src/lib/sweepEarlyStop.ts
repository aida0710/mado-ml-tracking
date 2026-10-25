import type { Run } from '@mmt/contracts';
import { SWEEP_EARLY_STOPPED_TAG } from './sweepRunTags';

/** Sweepが早期終了した試行。そのRunは、利用者が取り消したときと同じくcanceledで終わる。 */
export function isSweepEarlyStoppedRun(run: Pick<Run, 'status' | 'tags'>): boolean {
  return run.status === 'canceled' && run.tags[SWEEP_EARLY_STOPPED_TAG] === 'true';
}
