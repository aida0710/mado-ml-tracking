import type { HookFilter, RunKind } from '@mmt/contracts';

/** フィルタのためにイベントが自分について示す事実。無い事実はどの条件にも合わない。 */
export interface HookFilterSubject {
  modelFamily: string | null;
  experimentId: string | null;
  runKind: RunKind | null;
  runStatus: string | null;
  tags: Record<string, string>;
}

/** フィルタのすべての条件を満たす必要がある。空のフィルタはどのイベントにも合う。 */
export function matchesHookFilter(filter: HookFilter, subject: HookFilterSubject): boolean {
  const within = <T>(allowed: readonly T[] | undefined, value: T | null) =>
    allowed === undefined || (value !== null && allowed.includes(value));
  return (
    within(filter.modelFamilies, subject.modelFamily) &&
    within(filter.experimentIds, subject.experimentId) &&
    within(filter.runKinds, subject.runKind) &&
    within<string>(filter.runStatuses, subject.runStatus) &&
    Object.entries(filter.tags ?? {}).every(([key, value]) => subject.tags[key] === value)
  );
}
