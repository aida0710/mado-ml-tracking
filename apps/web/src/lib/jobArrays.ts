import type { Job, JobStatus } from '@mmt/contracts';

/** arrayのまとめで状態を並べる順。まだ動いているものを先に、次にJobの終わり方。 */
export const JOB_ARRAY_STATE_ORDER: readonly JobStatus[] = [
  'running',
  'claimed',
  'queued',
  'finished',
  'failed',
  'canceled',
];

/** 読み込んだJobの一覧から見た、1つのJob array。 */
export interface JobArraySummary {
  arrayGroupId: string;
  targetId: string;
  size: number;
  hookId: string | null;
  parentJobId: string | null;
  /** 最初のJobの作成日時。arrayのJobはまとめて作られる。 */
  createdAt: string;
  /** 一覧にある番号ごとの、最新の試行の状態。 */
  counts: Partial<Record<JobStatus, number>>;
}

type ArrayMember = Pick<
  Job,
  | 'arrayGroupId'
  | 'arrayIndex'
  | 'arraySize'
  | 'attempt'
  | 'status'
  | 'targetId'
  | 'hookId'
  | 'parentJobId'
  | 'createdAt'
>;

/**
 * arrayのJobをarrayGroupIdでまとめる。再実行したJobは番号を引き継ぐので、番号ごとに最新の試行で
 * 1回だけ数える。まとまりは一覧の順を保つ（APIは新しいJobから並べる）。
 */
export function summarizeJobArrays(jobs: readonly ArrayMember[]): JobArraySummary[] {
  const newestAttempts = new Map<string, Map<number, ArrayMember>>();
  for (const job of jobs) {
    if (job.arrayGroupId === null || job.arrayIndex === null) continue;
    const members = newestAttempts.get(job.arrayGroupId) ?? new Map<number, ArrayMember>();
    const known = members.get(job.arrayIndex);
    if (!known || job.attempt > known.attempt) members.set(job.arrayIndex, job);
    newestAttempts.set(job.arrayGroupId, members);
  }
  return [...newestAttempts].map(([arrayGroupId, members]) => {
    const jobsOfGroup = [...members.values()];
    const first = jobsOfGroup.reduce((earliest, job) =>
      job.createdAt < earliest.createdAt ? job : earliest,
    );
    const counts: Partial<Record<JobStatus, number>> = {};
    for (const job of jobsOfGroup) counts[job.status] = (counts[job.status] ?? 0) + 1;
    return {
      arrayGroupId,
      targetId: first.targetId,
      size: first.arraySize ?? jobsOfGroup.length,
      hookId: first.hookId,
      parentJobId: first.parentJobId,
      createdAt: first.createdAt,
      counts,
    };
  });
}
