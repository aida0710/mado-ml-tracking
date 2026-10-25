import type { RunGroupBy } from '@mmt/contracts';

/** キーの無いタグやパラメータのグループ分けは、まだ要求できない。 */
export const isCompleteGrouping = (value: RunGroupBy | undefined): value is RunGroupBy =>
  value !== undefined && (value.kind === 'experiment' || Boolean(value.key?.trim()));
