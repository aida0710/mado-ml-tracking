import type { JobStatus } from '@mmt/contracts';

/**
 * Run・Jobの状態ごとの状態バッジの色（@mado/design-system の役割の class。.status-badge と一緒に
 * 付ける）。待っているもの・取り消したものは灰色、進んでいるもの（取得済みを含む）は青。
 */
export const JOB_STATUS_BADGE_CLASS: Record<JobStatus, string> = {
  queued: 'status-neutral',
  claimed: 'status-info',
  running: 'status-info',
  finished: 'status-success',
  failed: 'status-danger',
  canceled: 'status-neutral',
};

export function isJobStatus(value: string): value is JobStatus {
  return Object.hasOwn(JOB_STATUS_BADGE_CLASS, value);
}
