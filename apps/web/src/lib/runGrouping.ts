import type { RunGroupBy } from '@mmt/contracts';

/** A tag or param grouping without a key cannot be requested yet. */
export const isCompleteGrouping = (value: RunGroupBy | undefined): value is RunGroupBy =>
  value !== undefined && (value.kind === 'experiment' || Boolean(value.key?.trim()));
