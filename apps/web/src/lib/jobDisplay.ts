import type { Job, JobPhase, JobStatus } from '@mmt/contracts';
import { text } from '../i18n/catalog';
import { jobEndReasonLabels, jobPhaseLabels, jobsTextTemplates } from '../i18n/jobs';

const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ['queued', 'claimed', 'running'];
// 完全なidはtitleに残す。1つのProjectの中なら、8文字でJob・フック・arrayを見分けられる。
const SHORT_ID_LENGTH = 8;

export const shortId = (id: string): string => id.slice(0, SHORT_ID_LENGTH);

export interface JobBadge {
  label: string;
  /** 状態バッジの役割の class（@mado/design-system/components.css の .status-info など）。 */
  className: string;
}

// waiting_manualは人の操作を待つ。ほかの段階は、claimedのJobと同じく進んでいる途中。
const phaseBadgeClass: Record<Exclude<JobPhase, 'running'>, string> = {
  waiting_manual: 'status-attention',
  submitting: 'status-info',
  submitted: 'status-info',
  waiting_resources: 'status-info',
};

export const isActiveJob = (job: Pick<Job, 'status'>): boolean =>
  ACTIVE_JOB_STATUSES.includes(job.status);

/**
 * Jobの状態の横に付けるバッジ。動いているsiteのJobなら待機中から実行中までのどこにいるか、終わった
 * siteのJobなら止まった理由。状態を繰り返すだけのとき（実行中のコンテナ）や、段階の無い
 * ssh・localのJob、siteの理由の無い終わったJobではnull。
 */
export function jobDetailBadge(job: Pick<Job, 'status' | 'phase' | 'endReason'>): JobBadge | null {
  if (!isActiveJob(job))
    return job.endReason
      ? { label: jobEndReasonLabels[job.endReason], className: 'status-danger' }
      : null;
  if (!job.phase || job.phase === 'running') return null;
  return { label: jobPhaseLabels[job.phase], className: phaseBadgeClass[job.phase] };
}

/**
 * 詳細に出すsiteのJobの段階。段階の無い待機中のsiteのJobは、ランチャーを待っている。終わったJobは
 * 最後に達した段階を残す。
 */
export function jobPhaseText(job: Pick<Job, 'status' | 'phase'>, isSite: boolean): string | null {
  if (job.phase) return jobPhaseLabels[job.phase];
  return isSite && job.status === 'queued' ? text.jobLauncherWaiting : null;
}

/**
 * JobのGPU。持っているGPUのIDか、runnerがIDを知らせる前ならsiteのJobが求めた数
 * （ssh・localのJobは、常に数と同じだけのIDを持つ）。
 */
export function jobGpuSummary(job: Pick<Job, 'gpuIds' | 'gpuCount'>): string {
  if (job.gpuIds.length) return job.gpuIds.join(', ');
  return job.gpuCount > 0 ? jobsTextTemplates.gpuCount(job.gpuCount) : text.cpuOnly;
}

/** arrayのJobの"index / size"。arrayに入っていないJobではnull。 */
export function jobArrayMemberLabel(job: Pick<Job, 'arrayIndex' | 'arraySize'>): string | null {
  if (job.arrayIndex === null || job.arraySize === null) return null;
  return jobsTextTemplates.arrayMember(job.arrayIndex, job.arraySize);
}

/** siteのJob（またはフックのJob）が求めた自動の再実行。無ければ"none"。 */
export function formatAutoRetries(flags: Pick<Job, 'retryOnFailure' | 'retryOnTimeout'>): string {
  const retries = [
    flags.retryOnFailure && text.jobRetryOnFailure,
    flags.retryOnTimeout && text.jobRetryOnTimeout,
  ].filter(Boolean);
  return retries.join(' / ') || text.none;
}

/**
 * "attempt / maxAttempts"。maxAttemptsは自動の再実行だけの上限なので、人がそれを超えて再実行した
 * Jobでは、上限より多い試行回数を出す代わりにそのことを伝える。
 */
export function jobAttemptLabel(job: Pick<Job, 'attempt' | 'maxAttempts'>): string {
  return job.attempt <= job.maxAttempts
    ? jobsTextTemplates.attempt(job.attempt, job.maxAttempts)
    : jobsTextTemplates.attemptPastLimit(job.attempt, job.maxAttempts);
}
